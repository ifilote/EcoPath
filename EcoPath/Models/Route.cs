namespace EcoPath.Models
{
    public class Route
    {
        public int Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public ApplicationUser? User { get; set; }
        public string Name { get; set; } = string.Empty;
        public string StartLocation { get; set; } = string.Empty;
        public string EndLocation { get; set; } = string.Empty;
        public double Distance { get; set; }
        public bool IsFavorite { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
