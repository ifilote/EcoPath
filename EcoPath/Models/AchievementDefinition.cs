namespace EcoPath.Models
{
    /// <summary>
    /// Catalog cu TOATE achievement-urile posibile din aplicatie.
    /// Conditiile sunt evaluate dinamic in controller.
    /// </summary>
    public class AchievementDefinition
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string Icon { get; set; } = string.Empty;           // Bootstrap icon class (ex: "bi-bicycle")

        // Conditii pentru deblocare
        public string ConditionType { get; set; } = string.Empty;  // "trips", "distance", "co2", "calories"
        public double ConditionValue { get; set; }                 // valoarea necesara (ex: 10.0 = 10 trips)
    }
}
