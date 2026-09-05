import { useSyncExternalStore } from 'react';

export type VoucherStatus = 'AVAILABLE' | 'ACTIVE' | 'EXPIRED';

export type MockVoucher = {
  id: string;
  title: string;
  cost: number;
  description: string;
  token: string;
  status: VoucherStatus;
  activatedAt?: number;
  expiresAt?: number;
};

const ACTIVATION_DURATION_MS = 5 * 60 * 1000;
const createdAt = Date.now();

let vouchers: readonly MockVoucher[] = [
  {
    id: 'demo-available',
    title: '₱500 Voucher',
    cost: 250,
    description: 'A frontend demonstration voucher ready for activation at the counter.',
    token: 'LIFEFLOW-DEMO-VOUCHER-001',
    status: 'AVAILABLE',
  },
  {
    id: 'demo-active',
    title: '₱300 Voucher',
    cost: 180,
    description: 'A frontend demonstration voucher with an active QR window.',
    token: 'LIFEFLOW-DEMO-VOUCHER-002',
    status: 'ACTIVE',
    activatedAt: createdAt - 60 * 1000,
    expiresAt: createdAt + 4 * 60 * 1000,
  },
  {
    id: 'demo-expired',
    title: '₱200 Voucher',
    cost: 120,
    description: 'A frontend demonstration voucher whose activation window has ended.',
    token: 'LIFEFLOW-DEMO-VOUCHER-003',
    status: 'EXPIRED',
    activatedAt: createdAt - 10 * 60 * 1000,
    expiresAt: createdAt - 5 * 60 * 1000,
  },
];

const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMockVouchers() {
  return useSyncExternalStore(subscribe, () => vouchers, () => vouchers);
}

export function addMockVoucher(voucher: Pick<MockVoucher, 'title' | 'cost'>) {
  const id = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const newVoucher: MockVoucher = {
    id,
    title: voucher.title,
    cost: voucher.cost,
    description: 'A LifeFlow reward voucher created for this frontend demonstration.',
    token: `LIFEFLOW-DEMO-${id.toUpperCase()}`,
    status: 'AVAILABLE',
  };

  vouchers = [newVoucher, ...vouchers];
  emitChange();
  return newVoucher;
}

export function activateMockVoucher(id: string) {
  const activatedAt = Date.now();
  let activatedVoucher: MockVoucher | undefined;

  vouchers = vouchers.map((voucher) => {
    if (voucher.id !== id || voucher.status !== 'AVAILABLE') return voucher;

    activatedVoucher = {
      ...voucher,
      status: 'ACTIVE',
      activatedAt,
      expiresAt: activatedAt + ACTIVATION_DURATION_MS,
    };
    return activatedVoucher;
  });

  if (activatedVoucher) emitChange();
  return activatedVoucher;
}

export function expireElapsedVouchers(now = Date.now()) {
  let changed = false;

  const nextVouchers = vouchers.map((voucher) => {
    if (voucher.status !== 'ACTIVE' || !voucher.expiresAt || voucher.expiresAt > now) {
      return voucher;
    }

    changed = true;
    return { ...voucher, status: 'EXPIRED' as const };
  });

  if (changed) {
    vouchers = nextVouchers;
    emitChange();
  }
}

// TODO: Laravel will become the source of truth for voucher ownership, status, points deduction,
// activated_at, expires_at, active-voucher recovery, duplicate-activation prevention, and any
// future partner or cashier verification. This module intentionally persists only for this session.
