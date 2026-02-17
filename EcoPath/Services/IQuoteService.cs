namespace EcoPath.Services
{
    /// <summary>
    /// Abstraction for eco-motivational quote retrieval.
    /// Decoupled from weather so quotes can evolve independently (e.g., future AI generation).
    /// </summary>
    public interface IQuoteService
    {
        QuoteResult GetQuote(string weatherType, double ecoScore = 0);
    }

    /// <summary>
    /// Immutable quote DTO.
    /// </summary>
    public class QuoteResult
    {
        public string Text { get; init; } = string.Empty;
        public string Author { get; init; } = string.Empty;
        public string WeatherType { get; init; } = string.Empty;
    }
}
