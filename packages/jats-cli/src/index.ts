#!/usr/bin/env node
import { Command } from 'commander';
import version from './version.js';
import { addDownloadCLI } from './parse.js';
import { addValidateCLI } from './validate.js';
import { addTestCLI } from './jats-test.js';
import { addConvertCLI } from './convert.js';

const program = new Command();

addDownloadCLI(program);
addValidateCLI(program);
addConvertCLI(program);
addTestCLI(program);

program.version(`v${version}`, '-v, --version', 'Print the current version of jats');
program.option('-d, --debug', 'Log out any errors to the console.');
program.parse(process.argv);
