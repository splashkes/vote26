import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Box } from '@radix-ui/themes';

const MarkdownRenderer = ({ content }) => {
  return (
    <Box className="markdown-content" style={{ lineHeight: '1.6' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => (
            <h1 style={{ fontSize: '2em', fontWeight: 'bold', marginTop: '0.5em', marginBottom: '0.5em' }} {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 style={{ fontSize: '1.5em', fontWeight: 'bold', marginTop: '0.75em', marginBottom: '0.5em' }} {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 style={{ fontSize: '1.25em', fontWeight: 'bold', marginTop: '0.75em', marginBottom: '0.5em' }} {...props} />
          ),
          p: ({ node, ...props }) => (
            <p style={{ marginBottom: '1em' }} {...props} />
          ),
          ul: ({ node, ...props }) => (
            <ul style={{ marginLeft: '1.5em', marginBottom: '1em', listStyleType: 'disc' }} {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol style={{ marginLeft: '1.5em', marginBottom: '1em', listStyleType: 'decimal' }} {...props} />
          ),
          li: ({ node, ...props }) => (
            <li style={{ marginBottom: '0.5em' }} {...props} />
          ),
          strong: ({ node, ...props }) => (
            <strong style={{ fontWeight: 'bold' }} {...props} />
          ),
          em: ({ node, ...props }) => (
            <em style={{ fontStyle: 'italic' }} {...props} />
          ),
          a: ({ node, ...props }) => (
            <a style={{ color: 'var(--blue-9)', textDecoration: 'underline' }} target="_blank" rel="noopener noreferrer" {...props} />
          ),
          code: ({ node, inline, ...props }) =>
            inline ? (
              <code style={{ backgroundColor: 'var(--gray-3)', padding: '0.2em 0.4em', borderRadius: '3px', fontSize: '0.9em' }} {...props} />
            ) : (
              <code style={{ display: 'block', backgroundColor: 'var(--gray-3)', padding: '1em', borderRadius: '5px', overflowX: 'auto', marginBottom: '1em' }} {...props} />
            ),
          hr: ({ node, ...props }) => (
            <hr style={{ border: 'none', borderTop: '1px solid var(--gray-6)', margin: '1.5em 0' }} {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </Box>
  );
};

export default MarkdownRenderer;
