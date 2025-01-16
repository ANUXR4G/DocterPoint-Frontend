type Props = {
  name:
    | "half-box-pattern"
    | "dotted-patern"
    | "gradient-1"
    | "gradient-2"
    | "gradient-3"
  className?: string
}

export default function Background({ name, className }: Props) {
  switch (name) {
    case "half-box-pattern":
      return (
        <div
          className={`${
            className && className
          } absolute z-[-10] inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)] webkit-half-box-patern-mask`}
        />
      )
    case "dotted-patern":
      return (
        <div
          className={`${
            className && className
          } size-full absolute inset-0 -z-10 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]`}
        />
      )

    case "gradient-1":
      return (
        <div
          className={`${
            className && className
          } absolute top-0 z-[-15] size-full bg-white bg-[radial-gradient(100%_50%_at_50%_0%,rgba(0,163,255,0.13)_0,rgba(0,163,255,0)_50%,rgba(0,163,255,0)_100%)]`}
        />
      )

    case "gradient-2":
      return (
        <div className={className}>
          <div className="absolute right-0 top-0 -z-10 m-auto size-[310px] lg:size-[500px] md rounded-full bg-fuchsia-400 opacity-20 dark:opacity-10 blur-[100px]" />
          <div className="hidden dark:block absolute right-0 top-10 -z-10 m-auto size-[310px] xxl:size-[800px] md rounded-full bg-blue-400 opacity-10 blur-[100px]" />
        </div>
      )

    case "gradient-3":
      return (
        <div className={className}>
          <div className="absolute right-0 bottom-0 -z-10 m-auto size-[80px] lg:size-[200px] md rounded-full bg-fuchsia-400 opacity-20 dark:opacity-10 blur-[100px]" />
          <div className="absolute right-0 bottom-10 -z-10 m-auto size-[80px] lg:size-[200px] md rounded-full bg-blue-400 opacity-10 blur-[100px]" />
        </div>
      )
    default:
      return <div />
  }
}
