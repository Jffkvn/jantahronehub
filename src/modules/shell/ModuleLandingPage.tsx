interface ModuleLandingPageProps {
  eyebrow: string
  title: string
  description: string
}

export function ModuleLandingPage({
  eyebrow,
  title,
  description,
}: ModuleLandingPageProps) {
  return (
    <section className="oh-module-landing">
      <p>{eyebrow}</p>
      <h2>{title}</h2>
      <div className="oh-module-landing__line" />
      <p>{description}</p>
      <span>This module is scheduled for a later verified build phase.</span>
    </section>
  )
}
