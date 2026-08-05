import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf.js resolves its worker relative to the installed package. Bundling it
  // into a route chunk leaves that worker behind and breaks PDF parsing.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
