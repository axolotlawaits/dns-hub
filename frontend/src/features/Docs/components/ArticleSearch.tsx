// features/Docs/components/ArticleSearch.tsx
import { TextInput, ActionIcon } from '@mantine/core';
import { IconSearch, IconX } from '@tabler/icons-react';

interface ArticleSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export default function ArticleSearch({ value, onChange }: ArticleSearchProps) {
  return (
    <TextInput
      placeholder="Поиск статей..."
      leftSection={<IconSearch size={16} />}
      rightSection={
        value && (
          <ActionIcon variant="subtle" onClick={() => onChange('')}>
            <IconX size={16} />
          </ActionIcon>
        )
      }
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: '100%' }}
    />
  );
}


