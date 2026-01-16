import {Footer} from '@/components/layout/footer';
import {HomeWindow} from '@/components/home/home-window';

export default function Home() {
    return (
        <div className="flex flex-col" style={{minHeight: '100vh'}}>
            <HomeWindow />
            <Footer />
        </div>
    );
}
