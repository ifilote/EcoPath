using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcoPath.Migrations
{
    /// <inheritdoc />
    public partial class AddTripLiveTrackingFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "AverageSpeed",
                table: "Trips",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "DistanceCovered",
                table: "Trips",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "EndLatitude",
                table: "Trips",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "EndLongitude",
                table: "Trips",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<string>(
                name: "RouteSummary",
                table: "Trips",
                type: "TEXT",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<double>(
                name: "StartLatitude",
                table: "Trips",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "StartLongitude",
                table: "Trips",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<int>(
                name: "Status",
                table: "Trips",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<double>(
                name: "TotalRouteDistance",
                table: "Trips",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AverageSpeed",
                table: "Trips");

            migrationBuilder.DropColumn(
                name: "DistanceCovered",
                table: "Trips");

            migrationBuilder.DropColumn(
                name: "EndLatitude",
                table: "Trips");

            migrationBuilder.DropColumn(
                name: "EndLongitude",
                table: "Trips");

            migrationBuilder.DropColumn(
                name: "RouteSummary",
                table: "Trips");

            migrationBuilder.DropColumn(
                name: "StartLatitude",
                table: "Trips");

            migrationBuilder.DropColumn(
                name: "StartLongitude",
                table: "Trips");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "Trips");

            migrationBuilder.DropColumn(
                name: "TotalRouteDistance",
                table: "Trips");
        }
    }
}
