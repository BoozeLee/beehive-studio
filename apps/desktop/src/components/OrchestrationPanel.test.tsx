import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OrchestrationPanel } from './OrchestrationPanel';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({
    task_id: 'test-id',
    status: 'completed',
    agents_invoked: ['rhythm_groove', 'drums'],
    reasoning: ['Agent reasoning step 1', 'Agent reasoning step 2'],
    errors: [],
  }),
}));

describe('OrchestrationPanel', () => {
  const mockReasoningHook = {
    steps: [] as any[],
    addStep: vi.fn(),
    appendReasoning: vi.fn(),
    complete: vi.fn(),
    clear: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with Multi-Agent Orchestration title', () => {
    render(
      <OrchestrationPanel
        brief="Test brief"
        clips={[]}
        bpm={142}
        onStatus={vi.fn()}
        onClipGenerated={vi.fn()}
        reasoningHook={mockReasoningHook}
      />
    );

    expect(screen.getByText('Multi-Agent Orchestration')).toBeInTheDocument();
  });

  it('displays all agent buttons', () => {
    render(
      <OrchestrationPanel
        brief="Test brief"
        clips={[]}
        bpm={142}
        onStatus={vi.fn()}
        onClipGenerated={vi.fn()}
        reasoningHook={mockReasoningHook}
      />
    );

    expect(screen.getByText('◆ Rhythm')).toBeInTheDocument();
    expect(screen.getByText('🥁 Drums')).toBeInTheDocument();
    expect(screen.getByText('🎹 Harmony')).toBeInTheDocument();
    expect(screen.getByText('🎵 Melody')).toBeInTheDocument();
    expect(screen.getByText('🎼 Arrange')).toBeInTheDocument();
  });

  it('shows chain mode checkbox', () => {
    render(
      <OrchestrationPanel
        brief="Test brief"
        clips={[]}
        bpm={142}
        onStatus={vi.fn()}
        onClipGenerated={vi.fn()}
        reasoningHook={mockReasoningHook}
      />
    );

    expect(screen.getByText('Chain mode (pass output to next agent)')).toBeInTheDocument();
  });

  it('displays Run Orchestration button', () => {
    render(
      <OrchestrationPanel
        brief="Test brief"
        clips={[]}
        bpm={142}
        onStatus={vi.fn()}
        onClipGenerated={vi.fn()}
        reasoningHook={mockReasoningHook}
      />
    );

    expect(screen.getByText('Run Orchestration')).toBeInTheDocument();
  });

  it('shows Style Analysis button', () => {
    render(
      <OrchestrationPanel
        brief="Test brief"
        clips={[]}
        bpm={142}
        onStatus={vi.fn()}
        onClipGenerated={vi.fn()}
        reasoningHook={mockReasoningHook}
      />
    );

    expect(screen.getByText('Style Analysis')).toBeInTheDocument();
  });

  it('toggles chain mode on checkbox click', () => {
    const onStatus = vi.fn();
    render(
      <OrchestrationPanel
        brief="Test brief"
        clips={[]}
        bpm={142}
        onStatus={onStatus}
        onClipGenerated={vi.fn()}
        reasoningHook={mockReasoningHook}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });
});