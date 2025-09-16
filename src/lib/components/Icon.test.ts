import { render, waitFor } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import Icon from '$lib/components/ui/Icon.svelte';

describe('Icon component', () => {
  it('renders a Lucide icon by name', async () => {
    const { container } = render(Icon, { props: { name: 'hash' } });
    await waitFor(() => {
      expect(container.querySelector('svg')).not.toBeNull();
    });
  });
});
