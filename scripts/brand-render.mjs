import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SojournerToken, PORTABLE_CSS } from "@sojournerbuilds/mark/tokens";
import fs from "node:fs";

const inner = renderToStaticMarkup(
  React.createElement(SojournerToken, { variant: "waymark", size: 512, spinning: false })
);
// Make standalone: inject portable CSS so the file renders correctly anywhere.
const standalone = inner.replace(
  /<svg([^>]*)>/,
  (_m, attrs) =>
    `<svg xmlns="http://www.w3.org/2000/svg"${attrs}><style>${PORTABLE_CSS}</style>`
);
fs.writeFileSync("public/logo.svg", standalone);
fs.writeFileSync("app/icon.svg", standalone);
console.log("wrote public/logo.svg + app/icon.svg,", standalone.length, "bytes");
