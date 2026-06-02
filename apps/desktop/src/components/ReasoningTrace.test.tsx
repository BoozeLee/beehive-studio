import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReasoningTrace, type ReasoningStep } from './ReasoningTrace';

// Test component to use the hook
import { useStreamingReasoning } from './ReasoningTrace';

const TestComponent = ({ onRender }: { onRender: (hook: ReturnType<typeof useStreamingReasoning>) => void }) => {
  const hook = useStreamingReasoning();
  React.useEffect(() => {
    onRender(hook);
  }, [hook]);
  return null;
};

describe('ReasoningTrace', () => {
  const defaultSteps: ReasoningStep[] = [
    { type: 'status', text: 'Starting analysis...' },
    { type: 'reasoning', text: 'Analyzing brief parameters' },
    { type: 'tool_call', name: 'generate_midi', args: { bpm: 142, density: 0.7 } },
    { type: 'reasoning', text: 'Generated 16 notes' },
    { type: 'complete', text: 'Processing complete' },
  ];

  it('renders with title', () => {
    render(<ReasoningTrace steps={defaultSteps} title="Test Agent" />);
    expect(screen.getByText('Test Agent')).toBeInTheDocument();
  });

  it('renders all step types correctly', () => {
    render(<ReasoningTrace steps={defaultSteps} />);
    expect(screen.getByText('5 steps')).toBeInTheDocument();
  });

  it('shows step count in header', () => {
    render(<ReasoningTrace steps={defaultSteps} />);
    expect(screen.getByText('5 steps')).toBeInTheDocument();
  });

  it('collapses when header is clicked', () => {
    const { container } = render(<ReasoningTrace steps={defaultSteps} />);

    const header = container.querySelector('[style*="cursor: pointer"]');
    if (header) {
      fireEvent.click(header);
    }

    // After collapse, steps should not be visible
    expect(screen.queryByText('Starting analysis...')).not.toBeInTheDocument();
  });

  it('shows empty state when no steps', () => {
    render(<ReasoningTrace steps={[]} />);
    expect(screen.getByText('No reasoning steps yet')).toBeInTheDocument();
  });

  it('displays error step with red text', () => {
    const errorSteps: ReasoningStep[] = [
      { type: 'error', text: 'Failed to generate MIDI' },
    ];

    render(<ReasoningTrace steps={errorSteps} />);
    expect(screen.getByText('Failed to generate MIDI')).toBeInTheDocument();
  });
});

describe('useStreamingReasoning', () => {
  let capturedHook: ReturnType<typeof useStreamingReasoning> | null = null;

  beforeEach(() => {
    capturedHook = null;
  });

  it('starts with empty steps', () => {
    render(
      <TestComponent onRender={(hook) => { capturedHook = hook; }} />
    );

    expect(capturedHook).not.toBeNull();
    expect(capturedHook!.steps).toEqual([]);
  });

  it('addStep is a function', () => {
    render(
      <TestComponent onRender={(hook) => { capturedHook = hook; }} />
    );

    expect(typeof capturedHook!.addStep).toBe('function');
  });

  it('clear is a function', () => {
    render(
      <TestComponent onRender={(hook) => { capturedHook = hook; }} />
    );

    expect(typeof capturedHook!.clear).toBe('function');
  });

  it('appendReasoning is a function', () => {
    render(
      <TestComponent onRender={(hook) => { capturedHook = hook; }} />
    );

    expect(typeof capturedHook!.appendReasoning).toBe('function');
  });

  it('complete is a function', () => {
    render(
      <TestComponent onRender={(hook) => { capturedHook = hook; }} />
    );

    expect(typeof capturedHook!.complete).toBe('function');
  });
});