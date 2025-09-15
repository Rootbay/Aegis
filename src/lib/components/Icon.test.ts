import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import Icon from '$lib/components/ui/Icon.svelte';

describe('Icon component', () => {
  it('should render the icon', () => {
    const { container } = render(Icon, { data: 'M12 2L2 7l10 5 10-5-10-5z' });
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
