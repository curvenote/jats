import { Command, Option } from 'commander';
import { validateJatsAgainstDtdWrapper } from 'jats-xml';
import { clirun, getSession } from 'myst-cli-utils';

function makeValidateCLI(program: Command) {
  const command = new Command('validate')
    .description(
      `
      Validate JATS file against DTD schema.

      The JATS DTD schema file is fetched from nih.gov ftp server if not available locally.
      This will attempt to infer the specific JATS DTD version, library, etc from the file header,
      but options are available to override the inferred values.
      `,
    )
    .argument('<file>', 'JATS file to validate')
    .addOption(
      new Option(
        '--library <value>',
        'JATS library - archiving, publishing, or authoring (default: archiving, if value cannot be inferred from file)',
      ),
    )
    .addOption(
      new Option(
        '--jats <version>',
        'JATS version, must be 1.1 or later (default: 1.3, if value cannot be inferred from file)',
      ),
    )
    .addOption(
      new Option(
        '--mathml <version>',
        'MathML version, 2 or 3 (default: 3, if value cannot be inferred from file)',
      ),
    )
    .addOption(
      new Option(
        '--oasis',
        'Use OASIS table model (default: false, if value cannot be inferred from file)',
      ),
    )
    .addOption(new Option('--directory <value>', 'Directory to save DTD file'))
    .action(clirun(validateJatsAgainstDtdWrapper, { program, getSession }));
  return command;
}

export function addValidateCLI(program: Command) {
  program.addCommand(makeValidateCLI(program));
}
