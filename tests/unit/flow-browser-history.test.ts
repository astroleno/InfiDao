import { createFlowHistory } from '@/lib/flow-browser/history';

test('return uses the existing browser entry, while restoring does not append history', () => {
  const onNavigate = jest.fn(), controller = createFlowHistory(onNavigate), go = jest.spyOn(history, 'go').mockImplementation(() => {});
  controller.initialize('root'); const before = history.length;
  controller.push('child'); controller.push('grandchild');
  expect(history.length).toBe(before + 2);
  controller.returnTo('root'); expect(go).toHaveBeenCalledWith(-2);
  expect(history.length).toBe(before + 2);
  window.dispatchEvent(new PopStateEvent('popstate', { state: { flowPathId: 'child' } }));
  expect(onNavigate).toHaveBeenLastCalledWith('child');
  expect(history.length).toBe(before + 2);
  controller.dispose(); go.mockRestore();
});
test('a persisted ancestor outside the current browser trail replaces rather than appends an entry', () => {
  const onNavigate = jest.fn(), controller = createFlowHistory(onNavigate);
  controller.initialize('child'); const before = history.length;
  controller.returnTo('older-parent');
  expect(controller.current()).toBe('older-parent'); expect(history.length).toBe(before);
  expect(location.search).toBe('?reading=older-parent'); expect(onNavigate).toHaveBeenCalledWith('older-parent');
  controller.dispose();
});
