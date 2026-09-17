// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminTrackingManager from './AdminTrackingManager';
import { adminFetch } from '@/lib/serverAuth';
vi.mock('@/lib/serverAuth', () => ({ adminFetch: vi.fn() }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/order-thumbnail', () => ({ getFinalizedThumbnailUrl: () => '/similar-banner.png' }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
afterEach(() => { act(() => root?.unmount()); document.body.innerHTML = ''; vi.clearAllMocks(); });
const order = (id: string) => ({ id, customer_name: `Customer ${id}`, email: `${id}@example.com`, status: 'paid', items: [{width_in:72,height_in:36}], tracking_numbers: [] } as any);
const click = async (container: Element, text: string) => { await act(async () => { (Array.from(container.querySelectorAll('button')).find(b => b.textContent?.trim() === text) as HTMLButtonElement).click(); }); };
describe('order-scoped tracking workflow', () => {
  it('updates only the selected order without remounting adjacent cards and blocks sending unsaved edits', async () => {
    const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    const updated = vi.fn();
    await act(async () => root.render(<><AdminTrackingManager order={order('order-a')} onUpdated={updated}/><AdminTrackingManager order={order('order-b')} onUpdated={updated}/></>));
    const sections = host.querySelectorAll('section'); const second = sections[1];
    await click(second, 'Add Tracking');
    const input = second.querySelector('input')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '123456789012'); input.dispatchEvent(new Event('input', {bubbles:true})); });
    expect((Array.from(second.querySelectorAll('button')).find(b=>b.textContent?.includes('Send Tracking Info')) as HTMLButtonElement).disabled).toBe(true);
    let resolve!: (value: any)=>void;
    vi.mocked(adminFetch).mockImplementationOnce(()=>new Promise(r=>resolve=r));
    await click(second,'Save Tracking');
    await click(second,'Save Tracking');
    expect(adminFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(vi.mocked(adminFetch).mock.calls[0][1]!.body as string);
    expect(body.id).toBe('order-b'); expect(body.trackingNumbers[0].trackingNumber).toBe('123456789012');
    await act(async()=>resolve(new Response(JSON.stringify({ok:true,status:'shipped'}))));
    expect(host.querySelectorAll('section')[1]).toBe(second);
    expect(sections[0].textContent).toContain('No tracking numbers saved');
    expect(second.textContent).toContain('Tracking saved for Order #ORDER-B');
    expect(updated).toHaveBeenCalledTimes(1);
    expect(adminFetch).toHaveBeenCalledTimes(1); // Saving never sends email.
  });
  it('retains the request ID after an uncertain email failure and submits the exact saved package list', async () => {
    const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    const packages = [{carrier:'fedex',trackingNumber:'123456789012',label:'Package 1'}];
    await act(async () => root.render(<AdminTrackingManager order={{...order('order-b'), tracking_numbers:packages}} onUpdated={vi.fn()}/>));
    vi.mocked(adminFetch).mockRejectedValueOnce(new Error('Connection lost'));
    await click(host,'Send Tracking Info');
    const first = JSON.parse(vi.mocked(adminFetch).mock.calls[0][1]!.body as string);
    vi.mocked(adminFetch).mockResolvedValueOnce(new Response(JSON.stringify({ok:true,emailId:'email-1',sentAt:'2026-09-17T12:00:00Z'})));
    await click(host,'Send Tracking Info');
    const retry = JSON.parse(vi.mocked(adminFetch).mock.calls[1][1]!.body as string);
    expect(retry).toEqual(first);
    expect(retry.orderId).toBe('order-b');
    expect(retry.expectedTrackingNumbers).toEqual(packages);
    expect(host.textContent).toContain('Tracking email sent for Order #ORDER-B');
  });
  it('keeps the draft available when saving fails', async () => {
    const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => root.render(<AdminTrackingManager order={{...order('order-a'), tracking_numbers:[{carrier:'fedex',trackingNumber:'123456789012',label:'Package 1'}]}} onUpdated={vi.fn()}/>));
    await click(host,'Edit Tracking');
    vi.mocked(adminFetch).mockResolvedValueOnce(new Response(JSON.stringify({error:'Unable to save'}),{status:500}));
    await click(host,'Save Tracking');
    expect(host.querySelector('input')?.value).toBe('123456789012');
    expect(host.textContent).toContain('Save Tracking');
  });

});
