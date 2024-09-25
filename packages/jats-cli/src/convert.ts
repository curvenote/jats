import { Command, Option } from 'commander';
import { jatsConvert } from 'jats-convert';

function makeConvertCLI(program: Command) {
  const command = new Command('convert')
    .description('Convert JATS file to MyST mdast json')
    .argument('<input>', 'The JATS file')
    .addOption(
      new Option(
        '--frontmatter <frontmatter>',
        'Treat JATS frontmatter fields as page or project, or ignore if not specified',
      ).choices(['page', 'project']),
    )
    .action(jatsConvert);
  return command;
}

export function addConvertCLI(program: Command) {
  program.addCommand(makeConvertCLI(program));
}
