// Group chapters for presentation while preserving native scrolling and anchor navigation.
(() => {
  const report = document.querySelector('.report-document');
  if (!report) return;

  const headings = Array.from(report.children).filter(node => node.matches('h2[id]'));
  headings.forEach((heading, index) => {
    const chapter = document.createElement('section');
    chapter.className = 'report-chapter';
    chapter.setAttribute('aria-labelledby', heading.id);
    heading.before(chapter);

    // Keep the generated Markdown, figures, and embedded playbook intact.
    let node = heading;
    while (node && node !== headings[index + 1]) {
      const next = node.nextSibling;
      chapter.append(node);
      node = next;
    }
  });
})();
