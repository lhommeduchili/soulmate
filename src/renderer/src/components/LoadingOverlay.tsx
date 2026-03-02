
import { MatrixText } from './MatrixText'

interface Props {
    text: string
}

export function LoadingOverlay({ text }: Props): JSX.Element {
    return (
        <div className="fixed inset-0 z-50 bg-app-bg flex flex-col items-center justify-center p-8 text-center font-mono">
            <div className="text-xl text-soul-green mb-2 lowercase tracking-tighter flex items-center">
                <style>{`
                    @keyframes blink-cursor {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0; }
                    }
                    .blink-cursor {
                        animation: blink-cursor 1s step-end infinite;
                    }
                `}</style>
                <MatrixText text={text} />
                <span className="ml-[2px] w-3 h-5 bg-soul-green inline-block blink-cursor"></span>
            </div>
        </div>
    )
}
