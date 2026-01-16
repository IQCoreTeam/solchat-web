'use client';

import {useCallback, useEffect, useMemo, useState} from 'react';
import {Button, Frame, TextInput, WindowContent, WindowHeader} from 'react95';

const HIDE_STORAGE_KEY = 'solchat:rpc-modal-hide-until';
const HIDE_DURATION_DAYS = 7;
const RPC_ERROR_EVENT = 'solchat:rpc-error';

interface RpcConfigPromptProps {
    endpointSource: 'custom' | 'provider' | 'default';
    setCustomRpcEndpoint: (endpoint: string | null) => void;
}

export function RpcConfigPrompt({endpointSource, setCustomRpcEndpoint}: RpcConfigPromptProps) {
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const shouldShow = useMemo(() => {
        if (typeof window === 'undefined') return false;
        if (endpointSource !== 'default') return false;
        try {
            const stored = window.localStorage.getItem(HIDE_STORAGE_KEY);
            if (!stored) return true;
            const hideUntil = Number(stored);
            if (!hideUntil) return true;
            // eslint-disable-next-line react-hooks/purity
            return Date.now() > hideUntil;
        } catch {
            return true;
        }
    }, [endpointSource]);

    useEffect(() => {
        if (shouldShow) {
            setOpen(true);
        } else {
            setOpen(false);
        }
    }, [shouldShow]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleRpcError = (event: Event) => {
            const detail = (event as CustomEvent<{ message?: string }>).detail;
            try {
                window.localStorage.removeItem(HIDE_STORAGE_KEY);
            } catch {
                // ignore
            }
            if (detail?.message) {
                setError(detail.message);
            }
            setOpen(true);
        };

        window.addEventListener(RPC_ERROR_EVENT, handleRpcError);
        return () => {
            window.removeEventListener(RPC_ERROR_EVENT, handleRpcError);
        };
    }, []);

    const validateEndpoint = useCallback(async (endpoint: string) => {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'getVersion',
                }),
            });

            if (!response.ok) {
                throw new Error(`RPC responded with HTTP ${response.status}`);
            }

            const data = await response.json();
            if (!data || (!data.result && !data.error)) {
                throw new Error('RPC response missing result field');
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to reach RPC endpoint';
            throw new Error(message);
        }
    }, []);

    const handleSave = useCallback(async () => {
        const trimmed = value.trim();


        setIsSaving(true);
        setError(null);
        try {
            await validateEndpoint(trimmed);
            setCustomRpcEndpoint(trimmed);
            setValue('');
            setOpen(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'RPC validation failed');
        } finally {
            setIsSaving(false);
        }
    }, [value, setCustomRpcEndpoint, validateEndpoint]);

    const handleHideForDays = useCallback(() => {
        try {
            const hideUntil = Date.now() + HIDE_DURATION_DAYS * 24 * 60 * 60 * 1000;
            window.localStorage.setItem(HIDE_STORAGE_KEY, String(hideUntil));
        } catch {
            // ignore
        }
        setOpen(false);
    }, []);

    const handleClearSavedRpc = useCallback(() => {
        setCustomRpcEndpoint(null);
        setValue('');
        setError(null);
        setOpen(false);
    }, [setCustomRpcEndpoint]);

    const handleClose = useCallback(() => {
        setOpen(false);
    }, []);

    if (!open) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-9999 flex items-center justify-center px-4 py-6">
            <Frame className="w-full max-w-lg   text-sm text-white ">

                <WindowHeader style={{display: 'flex', boxSizing: "border-box", justifyContent: 'space-between'}}>

                    <p>Use Your Own Solana RPC</p>
                    <Button onClick={handleClose} style={{height: 27, width: 27}}><span
                        className='close-icon '/></Button>
                </WindowHeader>

                <WindowContent>
                    <div className={"flex w-full justify-between mb-3"}>
                        <div>
                            <p className="text-xl">Set your rpc into your local cache!</p>
                            <p className="mb-2 ">
                                For faster, more reliable chat performance we recommend using a personal RPC endpoint.
                                Please enter your Devnet RPC URL below.
                            </p>
                            <p className="mb-4 text-xs bg-yellow-300">
                                * Example: <br/>https://devnet.helius-rpc.com/?api-key=XXXXXXXX
                            </p>

                        </div>

                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={"./Q_explain.png"} alt="Q_explain" className="w-40 h-auto"/>

                    </div>
                    <TextInput
                        type="text"
                        value={value}
                        onChange={(e) => {
                            setValue(e.target.value);
                            setError(null);
                        }}
                        placeholder="https://devnet.helius-rpc.com/?api-key=..."
                        className="w-full px-3 py-2 text-sm "
                    />
                    {error && <p className="mt-1 text-xs text-red-400">{error}</p>}

                    <div className="mt-4 flex flex-wrap gap-3 text-xs">
                        <Button type="button" onClick={handleSave} disabled={isSaving}>
                            {isSaving ? 'Validating…' : 'Save'}
                        </Button>
                        <Button
                            type="button"
                            onClick={handleClose}
                        >
                            Maybe Later
                        </Button>
                        <Button
                            type="button"
                            onClick={handleClearSavedRpc}
                        >
                            Clear saved RPC
                        </Button>
                        <Button
                            type="button"
                            onClick={handleHideForDays}
                        >
                            Hide for {HIDE_DURATION_DAYS} days
                        </Button>
                    </div>

                    <div className="mt-5 flex flex-col gap-2 text-xs">
                        <button
                            type="button"
                            onClick={() => window.open('https://www.helius.dev/', '_blank')}
                            className="text-green-700 underline decoration-dotted underline-offset-2 hover:text-green-500"
                        >
                            Get a Helius API key (Coming soon)
                        </button>
                        <button
                            type="button"
                            onClick={() => alert("let's make the tutorial in X and link here")}
                            className="text-green-700 underline decoration-dotted underline-offset-2 hover:text-green-500"
                        >
                            Setup tutorial (Coming soon)
                        </button>
                    </div>
                </WindowContent>
            </Frame>
        </div>
    );
}
