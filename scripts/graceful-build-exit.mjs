// vinext 0.0.50 forces process.exit(0) after building. On Windows, native
// handles can still be closing at that point. Let successful builds drain the
// event loop normally; errors retain the CLI's immediate nonzero exit behavior.
const immediateExit = process.exit.bind(process);
process.exit = (code = 0) => {
  if (Number(code) !== 0) return immediateExit(code);
  process.exitCode = 0;
};
