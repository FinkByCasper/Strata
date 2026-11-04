using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Strata.Migrations.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class Initial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "diagrams",
                columns: table => new
                {
                    id = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    view_token = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    data = table.Column<string>(type: "TEXT", nullable: false),
                    created_at = table.Column<long>(type: "INTEGER", nullable: false),
                    updated_at = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_diagrams", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_diagrams_updated_at",
                table: "diagrams",
                column: "updated_at");

            migrationBuilder.CreateIndex(
                name: "IX_diagrams_view_token",
                table: "diagrams",
                column: "view_token",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "diagrams");
        }
    }
}
