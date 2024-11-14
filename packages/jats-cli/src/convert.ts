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
    .addOption(
      new Option(
        '--no-dois, --no-doi',
        'By default, DOIs are used for references when available, to be later resolved against doi.org. This option disables that behavior and creates bibtex entries for citations with DOIs.',
      ),
    )
    .addOption(
      new Option(
        '--no-bibtex, --no-bib',
        'By default, a bibtex file will be written with referenced citations. This option prevents writing that file',
      ),
    )
    .action(jatsConvert);
  return command;
}

export function addConvertCLI(program: Command) {
  program.addCommand(makeConvertCLI(program));
}
