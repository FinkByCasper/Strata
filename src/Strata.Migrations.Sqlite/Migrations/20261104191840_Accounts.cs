using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Strata.Migrations.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class Accounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "owner_id",
                table: "diagrams",
                type: "TEXT",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    id = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    email = table.Column<string>(type: "TEXT", maxLength: 254, nullable: false),
                    display_name = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    password_hash = table.Column<string>(type: "TEXT", maxLength: 256, nullable: false),
                    created_at = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_users", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "diagram_shares",
                columns: table => new
                {
                    diagram_id = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    user_id = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    role = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    created_at = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_diagram_shares", x => new { x.diagram_id, x.user_id });
                    table.ForeignKey(
                        name: "FK_diagram_shares_diagrams_diagram_id",
                        column: x => x.diagram_id,
                        principalTable: "diagrams",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_diagram_shares_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "sessions",
                columns: table => new
                {
                    token_hash = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    user_id = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    created_at = table.Column<long>(type: "INTEGER", nullable: false),
                    expires_at = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sessions", x => x.token_hash);
                    table.ForeignKey(
                        name: "FK_sessions_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_diagrams_owner_id",
                table: "diagrams",
                column: "owner_id");

            migrationBuilder.CreateIndex(
                name: "IX_diagram_shares_user_id",
                table: "diagram_shares",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "IX_sessions_expires_at",
                table: "sessions",
                column: "expires_at");

            migrationBuilder.CreateIndex(
                name: "IX_sessions_user_id",
                table: "sessions",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "IX_users_email",
                table: "users",
                column: "email",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "diagram_shares");

            migrationBuilder.DropTable(
                name: "sessions");

            migrationBuilder.DropTable(
                name: "users");

            migrationBuilder.DropIndex(
                name: "IX_diagrams_owner_id",
                table: "diagrams");

            migrationBuilder.DropColumn(
                name: "owner_id",
                table: "diagrams");
        }
    }
}
