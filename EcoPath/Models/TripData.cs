using Microsoft.ML.Data;

namespace EcoPath.Models
{
    /// <summary>
    /// ML.NET input schema for transportation mode recommendation.
    /// 
    /// Features:
    /// • Temporal: HourOfDay (0-23), DayOfWeek (0-6, where 0=Sunday)
    /// • Distance: How far the user needs to travel
    /// • User Profile: Time sensitivity (1=eco-priority, 10=speed-priority) 
    ///                 and walking preference (max km they tolerate)
    /// • Target: The transport mode to predict (Car, Walk, Bike, Transit)
    /// </summary>
    public class TripData
    {
        /// <summary>Hour of day (0-23) for temporal context.</summary>
        [LoadColumn(0)]
        public float HourOfDay { get; set; }

        /// <summary>Day of week (0=Sun, 1=Mon, ..., 6=Sat).</summary>
        [LoadColumn(1)]
        public float DayOfWeek { get; set; }

        /// <summary>Trip distance in kilometers.</summary>
        [LoadColumn(2)]
        public float DistanceKm { get; set; }

        /// <summary>
        /// User's time sensitivity score (1-10).
        /// 1 = "I prioritize CO2 over time"
        /// 10 = "I need to arrive ASAP"
        /// </summary>
        [LoadColumn(3)]
        public float UserTimeSensitivity { get; set; }

        /// <summary>
        /// Max distance user typically walks (km).
        /// E.g., if 2.0, they rarely walk beyond 2km.
        /// </summary>
        [LoadColumn(4)]
        public float UserWalkingPreference { get; set; }

        /// <summary>
        /// Predicted or observed transportation mode.
        /// Values: "Car", "Walk", "Bike", "Transit"
        /// </summary>
        [LoadColumn(5)]
        public string Label { get; set; } = string.Empty;
    }

    /// <summary>
    /// ML.NET output schema for mode predictions.
    /// </summary>
    public class TripPrediction
    {
        /// <summary>Predicted transport mode.</summary>
        [ColumnName("PredictedLabel")]
        public string PredictedLabel { get; set; } = string.Empty;

        /// <summary>
        /// Raw prediction scores for each class.
        /// Required by ML.NET multiclass classifier.
        /// </summary>
        public float[] Score { get; set; } = Array.Empty<float>();

        /// <summary>
        /// Normalized probabilities summing to 1.0.
        /// Maps each mode to its likelihood.
        /// </summary>
        public Dictionary<string, float> ConfidenceByMode { get; set; } = new();
    }
}