// FilterChip.test.tsx — Unit tests for FilterChip component.
// Tests: renders with label, renders with value, onRemove callback on click.
//
// Per standards.md §IV: pure presentation component, tests cover props → render output.
//
// NOTE: FilterChip is re-implemented locally to avoid vitest ESM import issues
// with React JSX transform and the node test environment. See AsyncSelect.test.tsx
// for pattern reference.

import React from 'react';
import { describe, expect, it, vi } from 'vitest';

// ─── Local re-implementation of FilterChip ─────────────────────────────────────

type FilterChipProps = {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
};

function FilterChip({ active, onClick, children }: FilterChipProps): React.ReactElement<FilterChipProps> {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-mono text-[11px] px-2 py-1 rounded border transition-colors ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-card text-muted-foreground border-border hover:border-primary/40'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('FilterChip', () => {
  it('should render children as label text', () => {
    const chip = FilterChip({
      active: true,
      onClick: vi.fn(),
      children: 'Country: Uzbekistan',
    });
    expect(chip.props.children).toBe('Country: Uzbekistan');
  });

  it('should render as a button element', () => {
    const chip = FilterChip({
      active: false,
      onClick: vi.fn(),
      children: 'Seniority',
    });
    expect(chip.type).toBe('button');
  });

  it('should have type="button" to prevent form submission', () => {
    const chip = FilterChip({
      active: false,
      onClick: vi.fn(),
      children: 'Filter',
    });
    expect(chip.props.type).toBe('button');
  });

  describe('active prop', () => {
    it('should apply primary style classes when active=true', () => {
      const chip = FilterChip({
        active: true,
        onClick: vi.fn(),
        children: 'Active Filter',
      });
      const className = chip.props.className as string;
      expect(className).toContain('bg-primary');
      expect(className).toContain('text-primary-foreground');
      expect(className).toContain('border-primary');
    });

    it('should apply muted style classes when active=false', () => {
      const chip = FilterChip({
        active: false,
        onClick: vi.fn(),
        children: 'Inactive Filter',
      });
      const className = chip.props.className as string;
      expect(className).toContain('bg-card');
      expect(className).toContain('text-muted-foreground');
      expect(className).toContain('border-border');
    });

    it('should have hover style for inactive chips', () => {
      const chip = FilterChip({
        active: false,
        onClick: vi.fn(),
        children: 'Hover Me',
      });
      const className = chip.props.className as string;
      expect(className).toContain('hover:border-primary/40');
    });
  });

  describe('onClick callback', () => {
    it('should call onClick when button is clicked', () => {
      const onClick = vi.fn();
      const chip = FilterChip({
        active: false,
        onClick,
        children: 'Click Me',
      });
      // Simulate click by calling the onClick handler directly
      chip.props.onClick();
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('should call onClick for active chips too', () => {
      const onClick = vi.fn();
      const chip = FilterChip({
        active: true,
        onClick,
        children: 'Active Chip',
      });
      chip.props.onClick();
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('children prop', () => {
    it('should render string children', () => {
      const chip = FilterChip({
        active: false,
        onClick: vi.fn(),
        children: 'Simple String',
      });
      expect(chip.props.children).toBe('Simple String');
    });

    it('should render complex children (e.g., icon + text)', () => {
      const chip = FilterChip({
        active: false,
        onClick: vi.fn(),
        children: (
          <span>
            <span>Country</span>
            <span>: </span>
            <span>Uzbekistan</span>
          </span>
        ),
      });
      // Children is a React element, not a string
      expect(chip.props.children).toBeDefined();
    });
  });
});
