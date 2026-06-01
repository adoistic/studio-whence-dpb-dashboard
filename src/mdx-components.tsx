import type { MDXComponents } from 'mdx/types'

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h2: (props) => (
      <h2
        className="font-serif text-2xl font-light text-brand-indigo mt-8 mb-3"
        {...props}
      />
    ),
    p: (props) => (
      <p
        className="font-serif text-brand-umber leading-relaxed mb-4"
        {...props}
      />
    ),
    strong: (props) => (
      <strong className="font-medium text-brand-indigo" {...props} />
    ),
    em: (props) => <em className="italic" {...props} />,
    ...components,
  }
}
