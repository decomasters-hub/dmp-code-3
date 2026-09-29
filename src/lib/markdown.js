import { marked } from 'marked';

// Render assistant markdown to HTML. Raw inline HTML from model output is
// neutralized (rendered as escaped text) so generated markup can never
// inject elements or scripts into the transcript.
marked.setOptions({ breaks: true, gfm: true });

export function renderAssistantMarkdown(src) {
  const text = typeof src === 'string' ? src : '';
  try {
    return marked.parse(text, {
      walkTokens(token) {
        if (token.type === 'html') {
          token.type = 'text';
          token.text = token.raw;
        }
      },
    });
  } catch {
    return null;
  }
}
