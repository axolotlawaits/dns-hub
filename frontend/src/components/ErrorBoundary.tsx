import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, Button, Container, Stack, Text, Group } from '@mantine/core';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log to external service in production
    if (process.env.NODE_ENV === 'production') {
      // TODO: Send to error reporting service
      console.error('Production error:', {
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack
      });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <Container size="sm" py="xl">
          <Stack gap="lg" align="center">
            <Alert
              icon={<IconAlertTriangle size={16} />}
              title="Произошла ошибка"
              color="red"
              variant="light"
            >
              <Text size="sm" mb="md" c="var(--theme-text-primary)">
                Что-то пошло не так. Попробуйте обновить страницу или обратитесь к администратору.
              </Text>
              
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details style={{ marginTop: '1rem' }}>
                  <summary style={{ 
                    cursor: 'pointer', 
                    fontWeight: 'bold',
                    color: 'var(--theme-text-primary)'
                  }}>
                    Детали ошибки (только в разработке)
                  </summary>
                  <pre style={{ 
                    marginTop: '0.5rem', 
                    padding: '0.5rem', 
                    backgroundColor: 'var(--theme-bg-primary)', 
                    color: 'var(--theme-text-primary)',
                    border: '1px solid var(--theme-border)',
                    borderRadius: '4px',
                    fontSize: '12px',
                    overflow: 'auto'
                  }}>
                    {this.state.error.message}
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </Alert>

            <Group>
              <Button
                leftSection={<IconRefresh size={16} />}
                onClick={this.handleReset}
                variant="light"
              >
                Попробовать снова
              </Button>
              
              <Button
                onClick={() => window.location.reload()}
                variant="filled"
              >
                Обновить страницу
              </Button>
            </Group>
          </Stack>
        </Container>
      );
    }

    return this.props.children;
  }
}

// Hook-based error boundary for functional components
export const useErrorHandler = () => {
  const [error, setError] = React.useState<Error | null>(null);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  const captureError = React.useCallback((error: Error) => {
    setError(error);
  }, []);

  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  return { captureError, resetError };
};
