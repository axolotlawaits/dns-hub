import React from 'react';
import { Button, Transition } from '@mantine/core';
import { usePageHeader } from '../contexts/PageHeaderContext';
import './styles/FloatingActionButton.css';

const FloatingActionButton: React.FC = () => {
  const { header } = usePageHeader();

  if (!header.actionButton) {
    return null;
  }

  return (
    <Transition
      mounted={true}
      transition="slide-up"
      duration={300}
      timingFunction="ease"
    >
      {(styles) => (
        <div className="floating-action-button" style={styles}>
          <Button
            size="lg"
            radius="xl"
            onClick={header.actionButton?.onClick}
            loading={header.actionButton?.loading}
            className="fab-button"
            leftSection={header.actionButton?.icon}
          >
            {header.actionButton?.text}
          </Button>
        </div>
      )}
    </Transition>
  );
};

export default FloatingActionButton;