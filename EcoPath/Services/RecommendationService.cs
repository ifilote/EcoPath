using Microsoft.ML;
using Microsoft.ML.Data;
using EcoPath.Data;
using EcoPath.Models;
using Microsoft.EntityFrameworkCore;

namespace EcoPath.Services
{
    /// <summary>
    /// ML.NET-powered transportation recommendation engine.
    /// 
    /// Architecture:
    /// ─────────────
    /// • Trains on historical user trips (distance, time, mode chosen).
    /// • Multiclass classifier: predicts Car, Walk, Bike, or Transit.
    /// • Personalized: learns user preferences (time sensitivity, walking habits).
    /// • Graceful degradation: Falls back to heuristic if model unavailable.
    /// • Singleton: model loaded once at startup, shared across requests.
    /// • Model persistence: .zip file auto-saved for reuse across app restarts.
    /// 
    /// Training data features:
    ///   • HourOfDay, DayOfWeek: Temporal patterns (rush hour → more transit)
    ///   • DistanceKm: Distance strongly predicts mode
    ///   • UserTimeSensitivity: 1-10 scale (eco vs speed priority)
    ///   • UserWalkingPreference: Max km they tolerate walking
    /// 
    /// Output: Predicted mode + confidence scores for each class.
    /// </summary>
    public interface IRecommendationService
    {
        /// <summary>
        /// Initialize the recommendation engine.
        /// Called once at startup via Program.cs.
        /// </summary>
        Task InitializeAsync();

        /// <summary>
        /// Predict the best transportation mode for a user and trip.
        /// </summary>
        Task<TripPrediction> PredictModeAsync(string userId, TripData tripData);

        /// <summary>
        /// Retrain the model with updated user data.
        /// Call periodically to keep recommendations fresh.
        /// </summary>
        Task RetrainModelAsync();
    }

    public class RecommendationService : IRecommendationService
    {
        private readonly ILogger<RecommendationService> _logger;
        private readonly IServiceProvider _serviceProvider;
        private readonly string _modelPath;
        private PredictionEngine<TripData, TripPrediction>? _predictionEngine;
        private readonly object _modelLock = new();
        private bool _isInitialized = false;

        private const string MODEL_FILENAME = "ecopath_recommendation_model.zip";

        public RecommendationService(
            ILogger<RecommendationService> logger,
            IServiceProvider serviceProvider,
            IHostEnvironment env)
        {
            _logger = logger;
            _serviceProvider = serviceProvider;
            _modelPath = Path.Combine(env.ContentRootPath, "models", MODEL_FILENAME);
        }

        /// <summary>
        /// Initialize the recommendation engine.
        /// Called once at startup via Program.cs.
        /// </summary>
        public async Task InitializeAsync()
        {
            await Task.Run(() =>
            {
                lock (_modelLock)
                {
                    if (_isInitialized) return;

                    try
                    {
                        _logger.LogInformation("🚀 Initializing ML.NET Recommendation Engine...");

                        // Ensure models directory exists
                        var modelDir = Path.GetDirectoryName(_modelPath);
                        if (!Directory.Exists(modelDir))
                        {
                            Directory.CreateDirectory(modelDir!);
                            _logger.LogInformation("📁 Created models directory: {Path}", modelDir);
                        }

                        // Load existing model or train new one
                        if (File.Exists(_modelPath))
                        {
                            _logger.LogInformation("✓ Pre-trained model found at {Path}. Loading...", _modelPath);
                            try
                            {
                                LoadModel();
                            }
                            catch (Exception loadEx)
                            {
                                _logger.LogWarning(loadEx, "⚠️ Failed to load pre-trained model. Will retrain instead.");
                                // Delete the corrupted model file
                                try
                                {
                                    File.Delete(_modelPath);
                                    _logger.LogInformation("📁 Deleted corrupted model file.");
                                }
                                catch (Exception deleteEx)
                                {
                                    _logger.LogWarning(deleteEx, "Could not delete model file.");
                                }
                                TrainModelInternal();
                            }
                        }
                        else
                        {
                            _logger.LogWarning("⚠️ No pre-trained model found. Training initial model...");
                            TrainModelInternal();
                        }

                        _isInitialized = true;
                        _logger.LogInformation("✓ Recommendation Engine initialized successfully.");
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "❌ Failed to initialize Recommendation Engine. Service will use fallback heuristic.");
                        _isInitialized = true;
                    }
                }
            });     
        }

        /// <summary>
        /// Predict transportation mode for a specific user and trip context.
        /// </summary>
        public async Task<TripPrediction> PredictModeAsync(string userId, TripData tripData)
        {
            try
            {
                if (_predictionEngine == null)
                {
                    _logger.LogWarning("⚠️ Prediction engine not ready. Using heuristic fallback.");
                    return GetHeuristicRecommendation(tripData);
                }

                var prediction = _predictionEngine.Predict(tripData);
                await EnrichPredictionConfidenceAsync(prediction, userId);

                _logger.LogInformation("✓ Prediction: {Mode} (confidence: {Score}%)", 
                    prediction.PredictedLabel, 
                    prediction.ConfidenceByMode.TryGetValue(prediction.PredictedLabel, out var conf) 
                        ? (conf * 100).ToString("F1") 
                        : "N/A");

                return prediction;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Prediction failed for user {UserId}. Falling back to heuristic.", userId);
                return GetHeuristicRecommendation(tripData);
            }
        }

        /// <summary>
        /// Retrain model with fresh data from trips table.
        /// </summary>
        public async Task RetrainModelAsync()
        {
            _logger.LogInformation("🔄 Retraining recommendation model...");
            await Task.Run(() => TrainModelInternal());
        }

        // ═══════════════════════════════════════════════════════════════
        // PRIVATE: Model Training
        // ═══════════════════════════════════════════════════════════════

        private void TrainModelInternal()
        {
            lock (_modelLock)
            {
                try
                {
                    _logger.LogInformation("📚 Fetching training data from database...");

                    using (var scope = _serviceProvider.CreateScope())
                    {
                        var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                        var trainingData = FetchOrGenerateTrainingData(dbContext);

                        if (trainingData.Count == 0)
                        {
                            _logger.LogWarning("⚠️ No training data available. Using synthetic dataset.");
                            trainingData = GenerateSyntheticTrainingData();
                        }

                        _logger.LogInformation("✓ Training dataset: {Count} samples", trainingData.Count);

                        var (mlContext, model) = TrainModel(trainingData);
                        SaveModel(mlContext, model);

                        try
                        {
                            // Create prediction engine with schema flexibility
                            _predictionEngine = mlContext.Model.CreatePredictionEngine<TripData, TripPrediction>(
                                model, 
                                ignoreMissingColumns: true);
                            
                            _logger.LogInformation("✓ Model trained, saved, and prediction engine created successfully.");
                        }
                        catch (Exception engineEx)
                        {
                            _logger.LogError(engineEx, "❌ Failed to create prediction engine. Schema mismatch detected.");
                            throw;
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "❌ Model training failed.");
                }
            }
        }

        private List<TripData> FetchOrGenerateTrainingData(ApplicationDbContext dbContext)
        {
            try
            {
                var trips = dbContext.Trips
                    .Where(t => t.IsVerified)
                    .ToList();

                if (trips.Count < 10)
                {
                    _logger.LogWarning("⚠️ Insufficient verified trips ({Count}). Generating synthetic data.", trips.Count);
                    return GenerateSyntheticTrainingData();
                }

                return trips.Select(t => new TripData
                {
                    HourOfDay = t.StartTime.Hour,
                    DayOfWeek = (float)t.StartTime.DayOfWeek,
                    DistanceKm = (float)t.Distance,
                    UserTimeSensitivity = 5.0f,
                    UserWalkingPreference = GetUserWalkingPreference(dbContext, t.UserId),
                    Label = TransportTypeToLabel(t.TransportType)
                }).ToList();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error fetching training data from database.");
                return new List<TripData>();
            }
        }

        private List<TripData> GenerateSyntheticTrainingData()
        {
            var data = new List<TripData>();
            var rand = new Random(42);

            for (int i = 0; i < 500; i++)
            {
                var hour = rand.Next(0, 24);
                var dayOfWeek = (float)rand.Next(0, 7);
                var distance = (float)(rand.NextDouble() * 20 + 0.5);
                var timeSensitivity = (float)(rand.NextDouble() * 10);
                var walkingPref = rand.Next(1, 5);

                string mode = ChooseModeHeuristic(distance, hour, timeSensitivity);

                data.Add(new TripData
                {
                    HourOfDay = hour,
                    DayOfWeek = dayOfWeek,
                    DistanceKm = distance,
                    UserTimeSensitivity = timeSensitivity,
                    UserWalkingPreference = walkingPref,
                    Label = mode
                });
            }

            return data;
        }

        private (MLContext, ITransformer) TrainModel(List<TripData> trainingData)
        {
            var mlContext = new MLContext(seed: 42);
            var dataView = mlContext.Data.LoadFromEnumerable(trainingData);
            var dataSplit = mlContext.Data.TrainTestSplit(dataView, testFraction: 0.2);

            var pipeline = mlContext.Transforms
                .Conversion.MapValueToKey("Label", "Label")
                .Append(mlContext.Transforms.Concatenate("Features", 
                    nameof(TripData.HourOfDay),
                    nameof(TripData.DayOfWeek),
                    nameof(TripData.DistanceKm),
                    nameof(TripData.UserTimeSensitivity),
                    nameof(TripData.UserWalkingPreference)))
                .Append(mlContext.Transforms.NormalizeMinMax("Features"))
                .Append(mlContext.MulticlassClassification.Trainers
                    .SdcaMaximumEntropy(
                        labelColumnName: "Label",
                        featureColumnName: "Features",
                        l2Regularization: 0.001f))
                .Append(mlContext.Transforms.Conversion.MapKeyToValue("PredictedLabel", "PredictedLabel"));

            _logger.LogInformation("🔨 Training multiclass SdcaMaximumEntropy classifier...");
            var model = pipeline.Fit(dataSplit.TrainSet);

            var predictions = model.Transform(dataSplit.TestSet);
            var metrics = mlContext.MulticlassClassification.Evaluate(predictions);

            _logger.LogInformation(
                "✓ Model Training Complete | Accuracy: {Accuracy:P2}",
                metrics.MacroAccuracy);

            return (mlContext, model);
        }

        private void SaveModel(MLContext mlContext, ITransformer model)
        {
            mlContext.Model.Save(model, null, _modelPath);
            _logger.LogInformation("💾 Model saved to {Path}", _modelPath);
        }

        private void LoadModel()
        {
            var mlContext = new MLContext();
            var model = mlContext.Model.Load(_modelPath, out var schema);
            _predictionEngine = mlContext.Model.CreatePredictionEngine<TripData, TripPrediction>(model);
            _logger.LogInformation("✓ Model loaded successfully.");
        }

        // ═══════════════════════════════════════════════════════════════
        // PRIVATE: Utilities
        // ═══════════════════════════════════════════════════════════════

        private async Task EnrichPredictionConfidenceAsync(TripPrediction prediction, string userId)
        {
            var modes = new[] { "Bike", "Car", "Transit", "Walk" };
            prediction.ConfidenceByMode = new Dictionary<string, float>();
            
            if (prediction.Score != null && prediction.Score.Length == modes.Length)
            {
                float sum = (float)Math.Exp(prediction.Score.Sum());
                for (int i = 0; i < modes.Length; i++)
                {
                    var prob = (float)(Math.Exp(prediction.Score[i]) / sum);
                    prediction.ConfidenceByMode[modes[i]] = Math.Max(0, Math.Min(1, prob));
                }
            }
            else
            {
                foreach (var mode in modes)
                {
                    prediction.ConfidenceByMode[mode] = 0.25f;
                }
            }

            await Task.CompletedTask;
        }

        private TripPrediction GetHeuristicRecommendation(TripData tripData)
        {
            var mode = ChooseModeHeuristic(
                tripData.DistanceKm,
                (int)tripData.HourOfDay,
                tripData.UserTimeSensitivity);

            return new TripPrediction
            {
                PredictedLabel = mode,
                ConfidenceByMode = new Dictionary<string, float>
                {
                    { "Walk", mode == "Walk" ? 0.8f : 0.1f },
                    { "Bike", mode == "Bike" ? 0.8f : 0.1f },
                    { "Transit", mode == "Transit" ? 0.8f : 0.1f },
                    { "Car", mode == "Car" ? 0.8f : 0.1f }
                }
            };
        }

        private string ChooseModeHeuristic(float distanceKm, int hourOfDay, float timeSensitivity)
        {
            bool isRushHour = (hourOfDay >= 7 && hourOfDay <= 9) || (hourOfDay >= 17 && hourOfDay <= 19);

            if (distanceKm <= 2.0f)
                return "Walk";

            if (distanceKm <= 5.0f)
                return "Bike";

            if (isRushHour && timeSensitivity < 5)
                return "Transit";

            if (timeSensitivity >= 7)
                return "Car";

            return "Transit";
        }

        private float GetUserWalkingPreference(ApplicationDbContext dbContext, string userId)
        {
            try
            {
                var userTrips = dbContext.Trips
                    .Where(t => t.UserId == userId && t.TransportType == TransportType.Walking)
                    .ToList();

                if (userTrips.Count == 0)
                    return 2.0f;

                return (float)userTrips.Average(t => t.Distance);
            }
            catch
            {
                return 2.0f;
            }
        }

        private string TransportTypeToLabel(TransportType type) => type switch
        {
            TransportType.Walking => "Walk",
            TransportType.Biking => "Bike",
            TransportType.Bus or TransportType.Tram or TransportType.Metro => "Transit",
            TransportType.Car => "Car",
            _ => "Transit"
        };
    }
}