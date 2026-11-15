const { SHADER_PROGRAMS, UNIFORM_NAMES } = require('../../miniprogram/flow/renderer');

test('tooling sees every program the renderers link, including compile-time variants', () => {
  expect(SHADER_PROGRAMS.map((program: { name: string }) => program.name).sort()).toEqual([
    'background', 'bend', 'bend+hash', 'bend+lookup', 'bend+lookup+hash', 'glass', 'liquid', 'liquid+hash', 'screen', 'text',
  ]);
});

test('every declared uniform is registered, so none can silently stay at zero', () => {
  const declared = new Set<string>();
  for (const { vertex, fragment } of SHADER_PROGRAMS) {
    for (const match of `${vertex}\n${fragment}`.matchAll(/uniform\s+\w+\s+u_(\w+)\s*;/g)) declared.add(match[1]!);
  }
  const missing = [...declared].filter(name => !UNIFORM_NAMES.includes(name));
  expect(missing).toEqual([]);
});
