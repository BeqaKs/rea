import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";
import { createMarkdownRenderer, disposeMdItInstance } from "vitepress";
import { afterAll, expect, it } from "vitest";

import { createCli } from "../../../src/cli.js";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";

afterAll(() => disposeMdItInstance());

const serveCli = async (
  argv: readonly string[],
): Promise<{ readonly text: string; readonly exit: number }> => {
  const cli = createCli({});
  let text = "";
  let exit = 0;
  await cli.serve([...argv], {
    stdout: (chunk) => {
      text += chunk;
    },
    exit: (code) => {
      exit = code;
    },
    env: {},
  });
  return { text, exit };
};

const renderedMessageCells = (html: string): string[] => {
  const text = (node: DefaultTreeAdapterTypes.Node): string =>
    node.nodeName === "#text" && "value" in node
      ? node.value
      : "childNodes" in node
        ? node.childNodes.map(text).join("")
        : "";
  const cells: string[] = [];
  const visit = (node: DefaultTreeAdapterTypes.Node): void => {
    if ("tagName" in node && node.tagName === "td") cells.push(text(node));
    else if ("childNodes" in node) node.childNodes.forEach(visit);
  };
  visit(parseFragment(html));
  return cells;
};

it.each([
  ["analyze"],
  ["decompile"],
  ["setup", "--no-client"],
  ["search", "/caller/selected", "needle", "--kind", "unrecognized"],
])(
  "keeps correction fields and concise guidance for invalid CLI arguments: %j",
  async (...argv) => {
    const { text, exit } = await serveCli([...argv, "--json"]);
    expect(exit).toBe(1);
    const result = JSON.parse(text);
    expect(result).toMatchObject({
      code: "VALIDATION_ERROR",
      message:
        "REA could not read the command arguments. Check the named argument and its expected type, then try again.",
      fieldErrors: expect.any(Array),
    });
    expect(text).not.toContain("Details:");
    if (argv[0] === "search")
      expect(result.fieldErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "kind",
            code: "invalid_value",
            missing: false,
            message: expect.stringContaining('"strings"|"procedures"'),
          }),
        ]),
      );
    else if (argv[0] === "setup")
      expect(result.fieldErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "client",
            missing: false,
            expected: "array",
          }),
        ]),
      );
    else
      expect(result.fieldErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "path",
            missing: true,
            expected: "string",
          }),
        ]),
      );
  },
);

it("keeps every allowed search --kind value in Markdown validation tables", async () => {
  const { text, exit } = await serveCli([
    "search",
    "./missing-input",
    "needle",
    "--kind",
    "unrecognized",
    "--format",
    "md",
  ]);
  expect(exit).toBe(1);
  expect(text).toContain("VALIDATION_ERROR");
  expect(text).toContain('"strings"\\|"procedures"');
  expect(text).not.toMatch(/"strings"\|"procedures"/);

  const root = await createTestTempDirectory("rea-argument-md-enum-");
  const renderer = await createMarkdownRenderer(root, { linkify: false });
  const message = renderedMessageCells(renderer.render(text)).find((cell) =>
    cell.includes("strings"),
  );
  expect(message).toContain("strings");
  expect(message).toContain("procedures");
});
