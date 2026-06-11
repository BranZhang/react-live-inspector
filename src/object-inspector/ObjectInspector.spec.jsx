import React from 'react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ObjectInspector } from './ObjectInspector';
import { chromeLight } from '../styles/themes';
import { describe, it, expect } from 'vitest';

describe('ObjectInspector', () => {
  it('should render', () => {
    const { container } = render(<ObjectInspector />);
    expect(container).toMatchSnapshot();
  });

  it('passes `nodeRenderer` prop to <TreeView/>', () => {
    const nodeRenderer = () => <span>unit test</span>;

    const { container } = render(<ObjectInspector nodeRenderer={nodeRenderer} />);
    expect(container).toMatchSnapshot();
  });
});

describe('ObjectPreview max properties (#163)', () => {
  it('renders only an ellipsis when OBJECT_PREVIEW_OBJECT_MAX_PROPERTIES is 0', () => {
    const { container } = render(
      <ObjectInspector data={{ a: 1, b: 2 }} theme={{ ...chromeLight, OBJECT_PREVIEW_OBJECT_MAX_PROPERTIES: 0 }} />
    );
    expect(container.textContent).toContain('{…}');
    expect(container.textContent).not.toContain('a');
  });

  it('renders only an ellipsis when OBJECT_PREVIEW_ARRAY_MAX_PROPERTIES is 0', () => {
    const { container } = render(
      <ObjectInspector data={[1, 2, 3]} theme={{ ...chromeLight, OBJECT_PREVIEW_ARRAY_MAX_PROPERTIES: 0 }} />
    );
    expect(container.textContent).toContain('[…]');
    expect(container.textContent).not.toContain('1');
  });

  it('still truncates with an ellipsis at a positive limit', () => {
    const { container } = render(
      <ObjectInspector
        data={{ a: 1, b: 2, c: 3 }}
        theme={{ ...chromeLight, OBJECT_PREVIEW_OBJECT_MAX_PROPERTIES: 2 }}
      />
    );
    expect(container.textContent).toContain('a');
    expect(container.textContent).toContain('b');
    expect(container.textContent).toContain('…');
    expect(container.textContent).not.toContain('c');
  });
});

describe('ObjectInspector Content', () => {
  it('should render with Maps with Regex and Maps keys', async () => {
    const user = userEvent.setup();
    const data = new Map([[/\S/g, 'Regular Expression key']]);

    const { container } = render(<ObjectInspector data={data} />);

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Click the root row's clickable preview container (the inner div of the
    // first treeitem) to expand it.
    const button = container.querySelector('[role="treeitem"] div');
    await user.click(button);

    expect(container).toMatchSnapshot();
  });
});
