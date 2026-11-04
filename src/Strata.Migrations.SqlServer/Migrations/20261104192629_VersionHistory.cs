using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Strata.Migrations.SqlServer.Migrations
{
    /// <inheritdoc />
    public partial class VersionHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "updated_by_id",
                table: "diagrams",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "diagram_versions",
                columns: table => new
                {
                    id = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false, collation: "Latin1_General_100_BIN2"),
                    diagram_id = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false, collation: "Latin1_General_100_BIN2"),
                    author_id = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true, collation: "Latin1_General_100_BIN2"),
                    name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    data = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    kind = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    label = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    content_hash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    node_count = table.Column<int>(type: "int", nullable: false),
                    connector_count = table.Column<int>(type: "int", nullable: false),
                    zone_count = table.Column<int>(type: "int", nullable: false),
                    saved_at = table.Column<long>(type: "bigint", nullable: false),
                    created_at = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_diagram_versions", x => x.id);
                    table.ForeignKey(
                        name: "FK_diagram_versions_diagrams_diagram_id",
                        column: x => x.diagram_id,
                        principalTable: "diagrams",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_diagram_versions_users_author_id",
                        column: x => x.author_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_diagram_versions_author_id",
                table: "diagram_versions",
                column: "author_id");

            migrationBuilder.CreateIndex(
                name: "IX_diagram_versions_diagram_id_saved_at",
                table: "diagram_versions",
                columns: new[] { "diagram_id", "saved_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "diagram_versions");

            migrationBuilder.DropColumn(
                name: "updated_by_id",
                table: "diagrams");
        }
    }
}
