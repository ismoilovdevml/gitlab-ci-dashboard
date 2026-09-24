import { render, screen, fireEvent } from '@testing-library/react';
import PipelineVisualization from '../PipelineVisualization';
import { makeJob } from '../__fixtures__/gitlab';

function renderWith(status: string) {
  const handlers = {
    onJobClick: jest.fn(),
    onRetryJob: jest.fn(),
    onCancelJob: jest.fn(),
    onPlayJob: jest.fn(),
  };
  const job = makeJob({ id: 5, name: 'deploy', status });
  render(<PipelineVisualization jobs={[job]} {...handlers} />);
  return { job, ...handlers };
}

describe('PipelineVisualization job actions', () => {
  it('plays a manual job instead of retrying it', () => {
    const { job, onPlayJob, onRetryJob, onJobClick } = renderWith('manual');

    expect(screen.queryByTitle('Retry job')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Run job'));

    expect(onPlayJob).toHaveBeenCalledWith(job);
    expect(onRetryJob).not.toHaveBeenCalled();
    expect(onJobClick).not.toHaveBeenCalled();
  });

  it.each(['failed', 'success'])('retries a %s job', (status) => {
    const { job, onPlayJob, onRetryJob } = renderWith(status);

    expect(screen.queryByTitle('Run job')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Retry job'));

    expect(onRetryJob).toHaveBeenCalledWith(job);
    expect(onPlayJob).not.toHaveBeenCalled();
  });

  it.each(['running', 'pending'])('cancels a %s job', (status) => {
    const { job, onCancelJob, onRetryJob, onPlayJob } = renderWith(status);

    fireEvent.click(screen.getByTitle('Cancel job'));

    expect(onCancelJob).toHaveBeenCalledWith(job);
    expect(onRetryJob).not.toHaveBeenCalled();
    expect(onPlayJob).not.toHaveBeenCalled();
  });

  it('hides the run action when no play handler is given', () => {
    render(
      <PipelineVisualization
        jobs={[makeJob({ status: 'manual' })]}
        onJobClick={jest.fn()}
        onRetryJob={jest.fn()}
      />
    );

    expect(screen.queryByTitle('Run job')).not.toBeInTheDocument();
  });
});
