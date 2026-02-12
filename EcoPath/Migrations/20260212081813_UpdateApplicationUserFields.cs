using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EcoPath.Migrations
{
    /// <inheritdoc />
    public partial class UpdateApplicationUserFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "TotalCo2Saved",
                table: "AspNetUsers",
                newName: "Co2Saved");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "Co2Saved",
                table: "AspNetUsers",
                newName: "TotalCo2Saved");
        }
    }
}
