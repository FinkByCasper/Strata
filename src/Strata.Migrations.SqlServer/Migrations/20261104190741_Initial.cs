using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Strata.Migrations.SqlServer.Migrations
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
                    id = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false, collation: "Latin1_General_100_BIN2"),
                    view_token = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false, collation: "Latin1_General_100_BIN2"),
                    name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    data = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    created_at = table.Column<long>(type: "bigint", nullable: false),
                    updated_at = table.Column<long>(type: "bigint", nullable: false)
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
