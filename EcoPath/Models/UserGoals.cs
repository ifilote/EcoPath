namespace EcoPath.Models
{
    /// <summary>
    /// Obiective configurabile per utilizator.
    /// Fiecare user poate seta propriile target-uri saptamanale.
    /// </summary>
    public class UserGoals
    {
        public int Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public ApplicationUser? User { get; set; }

        public int WeeklyTripGoal { get; set; } = 7;          // default: 7 trips/saptamana
        public double WeeklyCo2Goal { get; set; } = 50.0;     // default: 50 kg CO2/saptamana
        public double WeeklyDistanceGoal { get; set; } = 30.0; // default: 30 km/saptamana
        public double WeeklyCaloriesGoal { get; set; } = 2000; // default: 2000 kcal/saptamana
    }
}
