import { useDashboardStore } from '@/store/dashboard-store';

export function useNotifications() {
  const { addNotification, notifyPipelineFailures, notifyPipelineSuccess: enableSuccessNotify } = useDashboardStore();

  const notifyPipelineRetry = (pipelineName: string) => {
    addNotification({
      id: Date.now().toString(),
      type: 'info',
      title: 'Pipeline Retrying',
      message: `Retrying pipeline ${pipelineName}`,
      timestamp: Date.now(),
    });
  };

  const notifyPipelineCancel = (pipelineName: string) => {
    addNotification({
      id: Date.now().toString(),
      type: 'warning',
      title: 'Pipeline Canceled',
      message: `Pipeline ${pipelineName} has been canceled`,
      timestamp: Date.now(),
    });
  };

  const notifyPipelineSuccess = (pipelineName: string) => {
    if (enableSuccessNotify) {
      addNotification({
        id: Date.now().toString(),
        type: 'success',
        title: 'Pipeline Succeeded',
        message: `Pipeline ${pipelineName} completed successfully`,
        timestamp: Date.now(),
      });
    }
  };

  const notifyPipelineFailed = (pipelineName: string) => {
    if (notifyPipelineFailures) {
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Pipeline Failed',
        message: `Pipeline ${pipelineName} has failed`,
        timestamp: Date.now(),
      });
    }
  };

  const notifyError = (title: string, message: string) => {
    addNotification({
      id: Date.now().toString(),
      type: 'error',
      title,
      message,
      timestamp: Date.now(),
    });
  };

  const notifySuccess = (title: string, message: string) => {
    addNotification({
      id: Date.now().toString(),
      type: 'success',
      title,
      message,
      timestamp: Date.now(),
    });
  };

  const notifyInfo = (title: string, message: string) => {
    addNotification({
      id: Date.now().toString(),
      type: 'info',
      title,
      message,
      timestamp: Date.now(),
    });
  };

  const notifyWarning = (title: string, message: string) => {
    addNotification({
      id: Date.now().toString(),
      type: 'warning',
      title,
      message,
      timestamp: Date.now(),
    });
  };

  return {
    notifyPipelineRetry,
    notifyPipelineCancel,
    notifyPipelineSuccess,
    notifyPipelineFailed,
    notifyError,
    notifySuccess,
    notifyInfo,
    notifyWarning,
  };
}
