using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Strata.Migrations.Postgres.Migrations
{
    /// <inheritdoc />
    public partial class ModelAssets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "model_assets",
                columns: table => new
                {
                    diagram_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    format = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    sha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    size = table.Column<long>(type: "bigint", nullable: false),
                    data = table.Column<byte[]>(type: "bytea", nullable: false),
                    created_at = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_model_assets", x => new { x.diagram_id, x.id });
                    table.ForeignKey(
                        name: "FK_model_assets_diagrams_diagram_id",
                        column: x => x.diagram_id,
                        principalTable: "diagrams",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_model_assets_diagram_id_sha256",
                table: "model_assets",
                columns: new[] { "diagram_id", "sha256" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "model_assets");
        }
    }
}
