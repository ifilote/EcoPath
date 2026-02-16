namespace EcoPath.Models
{
    public class TopUserDto
    {
        public string UserName { get; set; } = string.Empty;
        public string City { get; set; } = string.Empty;
        public double Co2Saved { get; set; }
        public int TotalTrips { get; set; }
    }
}
