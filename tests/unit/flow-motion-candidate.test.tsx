import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { FlowMenu } from '@/components/flow/FlowMenu';
import { readMotionCandidate, useMotionCandidate } from '@/lib/flow-browser/motion-candidate';
import { createFlowHistory } from '@/lib/flow-browser/history';

beforeEach(() => history.replaceState(null, '', '/infidao'));
afterEach(() => history.replaceState(null, '', '/infidao'));

test('the reader stays on the current material unless the URL opts in', () => {
  for (const search of ['', '?motion=unknown', '?motion=true', '?reading=liquid']) expect(readMotionCandidate(search)).toBeNull();
  expect(readMotionCandidate('?motion=liquid')).toBe('liquid-live');
  expect(readMotionCandidate('?motion=current')).toBe('current');
  const { result } = renderHook(useMotionCandidate);
  expect(result.current).toMatchObject({ available: false, variant: 'current' });
  act(() => result.current.toggle());
  expect(location.search).toBe('');
});

test('candidate toggles preserve the reading trail and URL without appending history', () => {
  const saved = { flowPathId: 'child', flowTrail: ['root', 'child'], other: 7 };
  history.replaceState(saved, '', '/infidao?reading=child&motion=liquid#quote');
  const before = history.length;
  const { result } = renderHook(useMotionCandidate);
  expect(result.current).toMatchObject({ available: true, variant: 'liquid-live' });
  act(() => result.current.toggle());
  expect(result.current.variant).toBe('current');
  expect(new URLSearchParams(location.search).get('motion')).toBe('current');
  expect(new URLSearchParams(location.search).get('reading')).toBe('child');
  expect(location.hash).toBe('#quote');
  expect(history.state).toEqual(saved); expect(history.length).toBe(before);
  act(() => result.current.toggle());
  expect(result.current.variant).toBe('liquid-live');
  expect(history.length).toBe(before);
});

test('candidate availability follows browser navigation without persisting a preference', () => {
  history.replaceState(null, '', '/infidao?motion=liquid');
  const { result } = renderHook(useMotionCandidate);
  act(() => { history.replaceState(null, '', '/infidao'); window.dispatchEvent(new PopStateEvent('popstate')); });
  expect(result.current).toMatchObject({ available: false, variant: 'current' });
});

test.each(['liquid', 'current'])('reader navigation preserves the explicit %s candidate selection', mode => {
  history.replaceState(null, '', `/infidao?motion=${mode}`);
  const controller = createFlowHistory(jest.fn());
  try {
    controller.initialize('root');
    expect(location.search).toBe(`?motion=${mode}`);
    controller.push('child');
    expect(new URLSearchParams(location.search).get('motion')).toBe(mode);
    expect(controller.current()).toBe('child');
    controller.returnTo('saved');
    expect(new URLSearchParams(location.search).get('motion')).toBe(mode);
    expect(controller.current()).toBe('saved');
  } finally { controller.dispose(); }
});

test('the candidate switch is absent from the normal menu and accessible in preview', () => {
  const onToggle = jest.fn();
  const props = { onThought: jest.fn(), onLibrary: jest.fn(), libraryDisabled: false };
  const view = render(<FlowMenu {...props} />);
  const trigger = screen.getByRole('button', { name: '更多阅读选项' });
  fireEvent.click(trigger);
  expect(screen.queryByRole('button', { name: /水膜动效/ })).not.toBeInTheDocument();
  view.rerender(<FlowMenu {...props} motionCandidate={{ enabled: true, onToggle }} />);
  const toggle = screen.getByRole('button', { name: '水膜动效 · 已开启' });
  expect(toggle).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(toggle);
  expect(onToggle).toHaveBeenCalledTimes(1);
  expect(trigger).toHaveFocus(); expect(trigger).toHaveAttribute('aria-expanded', 'false');
});
