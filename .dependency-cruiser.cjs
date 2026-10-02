/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domain-imports-only-domain",
      comment:
        "Business rules import nothing outside src/domain: no npm package, no other layer " +
        "(constitution V, R-16). Tests may import Vitest.",
      severity: "error",
      from: { path: "^src/domain/", pathNot: "\.test\.ts$" },
      to: { pathNot: "^src/domain/" },
    },
  ],
  options: {
    // Type-only imports count too, so a domain type cannot lean on an outer layer.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.app.json" },
    doNotFollow: { path: "node_modules" },
  },
};
