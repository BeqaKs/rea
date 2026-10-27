import { Errors } from "incur";

import { escapeCliMarkdownTableCell } from "./cliOutputFormatter.js";
import type { CliInstance } from "./types.js";
import { visitRegisteredCommands } from "./visitRegisteredCommands.js";

const ARGUMENT_GUIDANCE =
  "REA could not read the command arguments. Check the named argument and its expected type, then try again.";

type FieldError = Errors.ValidationError["fieldErrors"][number];

/**
 * Incur still builds parser-diagnostic Markdown tables. Escape every string
 * cell so allowed-value lists keep their pipes when VitePress or GFM renders
 * the row. Preserve property order so columnar headers stay stable.
 */
const escapeFieldErrorForMarkdown = (field: FieldError): FieldError => {
  const escaped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(field))
    escaped[key] =
      typeof value === "string" ? escapeCliMarkdownTableCell(value) : value;
  return escaped as FieldError;
};

/** Preserve parser correction fields without embedding its serialized cause. */
export const presentCliArgumentErrors = (cli: CliInstance): void => {
  visitRegisteredCommands(cli, (command) => {
    command.middleware = [
      async (context, next) => {
        try {
          await next();
        } catch (cause: unknown) {
          if (!(cause instanceof Errors.ValidationError)) throw cause;
          const fieldErrors =
            context.format === "md"
              ? cause.fieldErrors.map(escapeFieldErrorForMarkdown)
              : cause.fieldErrors;
          const failure = new Errors.ValidationError({
            message: ARGUMENT_GUIDANCE,
            fieldErrors,
          });
          // Incur's constructor appends cause.message as display details. Keep
          // the original error separately, without copying it into the message.
          Object.defineProperty(failure, "cause", { value: cause });
          throw failure;
        }
      },
      ...(command.middleware ?? []),
    ];
  });
};
