using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Strata.Migrations.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class DiagramOwnerKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddForeignKey(
                name: "FK_diagrams_users_owner_id",
                table: "diagrams",
                column: "owner_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_diagrams_users_owner_id",
                table: "diagrams");
        }
    }
}
