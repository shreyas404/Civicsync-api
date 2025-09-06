import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, increment, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";

// --- Firebase Configuration ---
const firebaseConfig = JSON.parse(process.env.REACT_APP_FIREBASE_CONFIG);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- New Catchy Logo Component ---
const CivicSyncLogo = ({ className }) => (
    <svg className={className} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#3b82f6' }} />
                <stop offset="100%" style={{ stopColor: '#6366f1' }} />
            </linearGradient>
            <linearGradient id="logoInnerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#1d4ed8' }} />
                <stop offset="100%" style={{ stopColor: '#4f46e5' }} />
            </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="45" fill="url(#logoGradient)" />
        <path d="M50,10 C27.94,10 10,27.94 10,50 C10,72.06 27.94,90 50,90 C72.06,90 90,72.06 90,50 C90,27.94 72.06,10 50,10 Z M50,80 C33.46,80 20,66.54 20,50 C20,33.46 33.46,20 50,20 C66.54,20 80,33.46 80,50 C80,66.54 66.54,80 50,80 Z" fill="url(#logoInnerGradient)" />
        <path d="M50 32C41.16 32 34 39.16 34 48L34 52C34 60.84 41.16 68 50 68C58.84 68 66 60.84 66 52L66 48C66 39.16 58.84 32 50 32ZM50 62C44.48 62 40 57.52 40 52L40 48C40 42.48 44.48 38 50 38C55.52 38 60 42.48 60 48L60 52C60 57.52 55.52 62 50 62Z" fill="white" />
        <path d="M42,50 a8,8 0 0,1 16,0" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
);


// --- Main App Component ---
export default function App() {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [issues, setIssues] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [userProfile, setUserProfile] = useState({ points: 0, badges: [], reportedIssues: 0 });
    const [authView, setAuthView] = useState('login'); // login, signup, guest
    const [viewingMedia, setViewingMedia] = useState(null);

    const issuesCollectionPath = `artifacts/${appId}/public/data/issues`;
    const getProfileDocPath = (uid) => `artifacts/${appId}/public/data/profiles/${uid}`;

    // --- Authentication Effect ---
    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setIsLoading(false);
        });
        return () => unsubscribeAuth();
    }, []);
    
    // --- Profile & Data Fetching Effect ---
    useEffect(() => {
        if (user) {
            const fetchUserProfile = async () => {
                const profileRef = doc(db, getProfileDocPath(user.uid));
                const docSnap = await getDoc(profileRef);
                if (docSnap.exists()) {
                    setUserProfile(docSnap.data());
                } else {
                    const initialProfile = { points: 0, badges: [], reportedIssues: 0, name: user.email || 'Guest User' };
                    await setDoc(profileRef, initialProfile);
                    setUserProfile(initialProfile);
                }
            };
            fetchUserProfile();

            const issuesCollectionRef = collection(db, issuesCollectionPath);
            const unsubscribeIssues = onSnapshot(issuesCollectionRef, (snapshot) => {
                const issuesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                issuesData.sort((a, b) => {
                    const upvoteDiff = (b.upvotes || 0) - (a.upvotes || 0);
                    if (upvoteDiff !== 0) return upvoteDiff;
                    return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
                });
                setIssues(issuesData);
            }, (err) => {
                console.error("Error fetching issues:", err);
                setError("Failed to load civic issues.");
            });
            
            return () => unsubscribeIssues();
        }
    }, [user]);

    // --- Auth Handlers ---
    const handleLogin = async (email, password) => {
        setIsLoading(true);
        setError(null);
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleSignup = async (email, password) => {
        setIsLoading(true);
        setError(null);
        try {
            await createUserWithEmailAndPassword(auth, email, password);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGuestLogin = async () => {
        setIsLoading(true);
        try {
            if (typeof __initial_auth_token !== 'undefined') {
                await signInWithCustomToken(auth, __initial_auth_token);
            } else {
                await signInAnonymously(auth);
            }
        } catch (err) {
            console.error("Error signing in as guest:", err);
            setError("Guest authentication failed.");
            setIsLoading(false);
        }
    };

    const handleLogout = async () => {
        await signOut(auth);
        setUser(null);
        setIssues([]);
        setUserProfile({ points: 0, badges: [], reportedIssues: 0 });
        setAuthView('login');
    };
    
    // --- Issue Handlers ---
    const addIssue = async (issue) => {
        if (!user) return setError("You must be signed in.");
        setIsSubmitting(true);
        setError(null);
        try {
            await addDoc(collection(db, issuesCollectionPath), { ...issue, status: 'Acknowledged', upvotes: 0, createdAt: new Date(), reporterId: user.uid });
            
            const profileRef = doc(db, getProfileDocPath(user.uid));
            const newReportCount = (userProfile.reportedIssues || 0) + 1;
            let newBadges = [...(userProfile.badges || [])];
            if (newReportCount >= 1 && !newBadges.includes('First Report')) newBadges.push('First Report');
            if (newReportCount >= 5 && !newBadges.includes('Neighborhood Hero')) newBadges.push('Neighborhood Hero');
            
            await setDoc(profileRef, { points: increment(10), reportedIssues: increment(1), badges: newBadges }, { merge: true });
            
            setShowForm(false);
        } catch (err) {
            console.error("Error adding document: ", err);
            setError("Failed to submit issue.");
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDelete = async (issueId) => {
        if (!user || !issueId) return;
        
        const originalIssues = [...issues];
        // Optimistically remove from UI
        setIssues(prevIssues => prevIssues.filter(issue => issue.id !== issueId));

        try {
            await deleteDoc(doc(db, issuesCollectionPath, issueId));
            const profileRef = doc(db, getProfileDocPath(user.uid));
            await updateDoc(profileRef, {
                points: increment(-10),
                reportedIssues: increment(-1)
            });
        } catch (err) {
            console.error("Error deleting document:", err);
            setError("Failed to delete the report. Please refresh and try again.");
            // **FIX:** Rollback UI change on failure
            setIssues(originalIssues);
        }
    };

    const handleUpvote = async (id) => {
        if (!user) return;
        const issueRef = doc(db, issuesCollectionPath, id);
        try {
            await updateDoc(issueRef, { upvotes: increment(1) });
        } catch (err) {
            console.error("Error upvoting issue:", err);
        }
    };
    
    // --- Render Logic ---
    if (isLoading) {
        return <div className="flex items-center justify-center min-h-screen bg-slate-50"><div className="text-xl font-semibold">Loading...</div></div>;
    }

    if (!user) {
        return <LoginScreen onLogin={handleLogin} onSignup={handleSignup} onGuestLogin={handleGuestLogin} authView={authView} setAuthView={setAuthView} error={error} />;
    }

    return (
        <div className="bg-slate-50 min-h-screen font-sans text-gray-800">
            <Header onLogout={handleLogout} />
            <main className="container mx-auto p-4 md:p-8">
                <UserProfile profile={userProfile} userId={user.uid} />
                <div className="text-center my-8">
                    <button onClick={() => setShowForm(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3 px-8 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all focus:outline-none focus:ring-4 focus:ring-blue-300 flex items-center justify-center mx-auto gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        Report New Civic Issue
                    </button>
                </div>
                {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative my-4 text-center" role="alert">{error}</div>}
                <IssueFeed issues={issues} onUpvote={handleUpvote} currentUserId={user.uid} onDelete={handleDelete} onViewMedia={setViewingMedia}/>
            </main>
            {showForm && <ReportIssueModal addIssue={addIssue} isSubmitting={isSubmitting} onClose={() => setShowForm(false)} />}
            {viewingMedia && <MediaViewerModal media={viewingMedia} onClose={() => setViewingMedia(null)} />}
        </div>
    );
}

// --- Authentication Components ---
const LoginScreen = ({ onLogin, onSignup, onGuestLogin, authView, setAuthView, error }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (authView === 'login') {
            onLogin(email, password);
        } else {
            onSignup(email, password);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <CivicSyncLogo className="w-24 h-24 mx-auto mb-4" />
                    <h1 className="text-5xl font-bold text-gray-800">CivicSync</h1>
                    <p className="text-gray-500 mt-2">Your Voice for a Better Community</p>
                </div>

                <div className="bg-white p-8 rounded-2xl shadow-lg">
                    <h2 className="text-2xl font-bold text-center mb-6">{authView === 'login' ? 'Sign In' : 'Sign Up'}</h2>
                    {error && <p className="bg-red-100 text-red-700 p-3 rounded-lg text-center mb-4">{error}</p>}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" required />
                        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" required />
                        <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors">
                            {authView === 'login' ? 'Login' : 'Create Account'}
                        </button>
                    </form>
                    <div className="text-center mt-4">
                        <button onClick={() => setAuthView(authView === 'login' ? 'signup' : 'login')} className="text-sm text-blue-600 hover:underline">
                            {authView === 'login' ? "Don't have an account? Sign Up" : "Already have an account? Login"}
                        </button>
                    </div>
                     <div className="my-6 flex items-center">
                        <div className="flex-grow border-t border-gray-300"></div>
                        <span className="flex-shrink mx-4 text-gray-400">OR</span>
                        <div className="flex-grow border-t border-gray-300"></div>
                    </div>
                    <button onClick={onGuestLogin} className="w-full bg-gray-700 text-white font-bold py-3 px-4 rounded-lg hover:bg-gray-800 transition-colors">
                       Continue as Guest
                    </button>
                </div>
            </div>
        </div>
    );
};


// --- Core App Components ---
const Header = ({ onLogout }) => (
   <header className="bg-white shadow-sm sticky top-0 z-20">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
                 <CivicSyncLogo className="w-8 h-8"/>
                <h1 className="text-2xl font-bold text-gray-800">CivicSync</h1>
            </div>
            <button onClick={onLogout} className="text-gray-500 hover:text-blue-600 font-semibold flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                <span>Logout</span>
            </button>
        </div>
    </header>
);

const UserProfile = ({ profile, userId }) => (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 mb-8">
        <h2 className="text-xl font-bold mb-4 text-gray-700">Your Civic Profile</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                <p className="text-3xl font-bold text-blue-600">{profile.points || 0}</p>
                <p className="text-sm text-blue-800 font-semibold">Coins Earned</p>
            </div>
            <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                 <p className="text-3xl font-bold text-green-600">{profile.reportedIssues || 0}</p>
                 <p className="text-sm text-green-800 font-semibold">Reports</p>
            </div>
            <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                <div className="flex justify-center items-center flex-wrap gap-2 min-h-[36px]">
                    {profile.badges && profile.badges.length > 0 ? profile.badges.map(badge => (
                        <span key={badge} className="bg-yellow-200 text-yellow-800 text-xs font-bold px-2.5 py-1 rounded-full">{badge}</span>
                    )) : <p className="text-sm text-yellow-800">No badges yet!</p>}
                </div>
                 <p className="text-sm text-yellow-800 font-semibold mt-1">Badges</p>
            </div>
        </div>
        {userId && <p className="text-xs text-gray-400 mt-4 text-center tracking-wider">User ID: {userId}</p>}
    </div>
);


const ReportIssueModal = ({ addIssue, isSubmitting, onClose }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [location, setLocation] = useState('');
    const [media, setMedia] = useState({ type: null, dataUrl: null });
    const [showCamera, setShowCamera] = useState(false);
    const [formError, setFormError] = useState('');
    const [locationStatus, setLocationStatus] = useState('');
    const [coordinates, setCoordinates] = useState(null);
    const [isRecording, setIsRecording] = useState(false);

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const fileInputRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);

    const handleMediaAction = async (action) => {
        if (action === 'takePhoto' || action === 'recordVideo') {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: action === 'recordVideo' });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    setShowCamera({ type: action });
                    if (action === 'recordVideo') {
                        startRecording(stream);
                    }
                }
            } catch (err) {
                setFormError("Could not access camera/mic. Please check permissions.");
            }
        } else if (action === 'recordAudio') {
             try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                startRecording(stream);
             } catch (err) {
                 setFormError("Could not access microphone. Please check permissions.");
             }
        } else {
             fileInputRef.current.accept = action === 'uploadPhoto' ? 'image/*' : action === 'uploadVideo' ? 'video/*' : 'audio/*';
             fileInputRef.current.dataset.mediaType = action.replace('upload', '').toLowerCase();
             fileInputRef.current.click();
        }
    };

    const startRecording = (stream) => {
        recordedChunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunksRef.current.push(event.data);
            }
        };
        recorder.onstop = () => {
            const blob = new Blob(recordedChunksRef.current, { type: recordedChunksRef.current[0].type });
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => {
                setMedia({ type: showCamera.type === 'recordVideo' ? 'video' : 'audio', dataUrl: reader.result });
            };
            stream.getTracks().forEach(track => track.stop());
            setShowCamera(false);
            setIsRecording(false);
        };
        recorder.start();
        setIsRecording(true);
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
    };
    
    const takePicture = () => {
        // **FIX:** Implemented takePicture function
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d');
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/png');
            setMedia({ type: 'photo', dataUrl });

            // Stop camera stream
            video.srcObject.getTracks().forEach(track => track.stop());
            setShowCamera(false);
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        // **FIX:** Changed `dataset.mediaType` to 'photo', 'video', etc.
        const mediaType = e.target.dataset.mediaType; 
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setMedia({ type: mediaType, dataUrl: event.target.result });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleGetLocation = () => {
        // **FIX:** Implemented geolocation function
        if (navigator.geolocation) {
            setLocationStatus('Fetching location...');
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    setCoordinates({ lat: latitude, lng: longitude });
                    setLocation(`Lat: ${latitude.toFixed(5)}, Lng: ${longitude.toFixed(5)}`);
                    setLocationStatus('Location captured!');
                },
                (err) => {
                    setLocationStatus('Unable to retrieve location. Please enter manually.');
                    console.error("Geolocation error:", err);
                }
            );
        } else {
            setLocationStatus("Geolocation is not supported by this browser.");
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!title.trim() || !description.trim() || !location.trim()) {
            setFormError('All fields are required.');
            return;
        }
        const issueData = { title, description, location, coordinates };
        
        // **FIX:** Correctly set dynamic property for media URL
        if (media.dataUrl) {
            issueData[`${media.type}Url`] = media.dataUrl;
        } else {
            // Use a different placeholder for issues without any media.
            issueData.imageUrl = 'https://placehold.co/600x400/EEE/31343C?text=No+Media+Provided';
        }
        addIssue(issueData);
    };

    // Render logic for ReportIssueModal...
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 transition-opacity duration-300">
              <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-lg relative transform transition-all duration-300 scale-95 opacity-0 animate-fade-in-scale flex flex-col max-h-[90vh]">
                    <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 z-10">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>

                    {/* Camera/Recording View */}
                    {showCamera && (
                         <div className='p-2'>
                              <video ref={videoRef} autoPlay playsInline className="w-full rounded-lg"></video>
                              {showCamera.type === 'takePhoto' && <button onClick={takePicture} className="w-full mt-4 bg-blue-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-600">Snap Photo</button>}
                              {showCamera.type === 'recordVideo' && (
                                  <button onClick={stopRecording} className="w-full mt-4 bg-red-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-red-600">Stop Recording</button>
                              )}
                              <canvas ref={canvasRef} className="hidden"></canvas>
                         </div>
                    )}

                    {/* Form View */}
                    {!showCamera && (
                         <>
                             <h2 className="text-2xl font-bold mb-2 text-center flex-shrink-0">Report a Civic Issue</h2>
                             <p className="text-center text-gray-500 mb-6 text-sm flex-shrink-0">Fill the details below. 'Snap. Tag. Send'.</p>
                             
                             <div className="overflow-y-auto px-1 flex-grow">
                                  {formError && <p className="text-red-500 text-sm mb-4 text-center">{formError}</p>}
                                <form id="issue-form" onSubmit={handleSubmit} className="space-y-4">
                                    <input type="text" placeholder="Issue Title (e.g., Pothole on Main St)" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                    <textarea placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows="3" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"></textarea>
                                    
                                    <div className="relative">
                                         <input type="text" placeholder="Location (e.g., Near City Park)" value={location} onChange={(e) => setLocation(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 pr-10" />
                                         <button type="button" onClick={handleGetLocation} className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-400 hover:text-blue-600">
                                             <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                         </button>
                                    </div>
                                    {locationStatus && <p className="text-xs text-center text-gray-500">{locationStatus}</p>}
                                    
                                    <div className="border border-gray-200 rounded-lg p-3">
                                        {media.dataUrl ? (
                                            <div className='text-center'>
                                                 {media.type === 'photo' && <img src={media.dataUrl} alt="Preview" className="rounded-lg max-h-40 mx-auto" />}
                                                 {media.type === 'video' && <video src={media.dataUrl} controls className="rounded-lg max-h-40 mx-auto" />}
                                                 {media.type === 'audio' && <audio src={media.dataUrl} controls className="w-full" />}
                                                <button type="button" onClick={() => setMedia({type: null, dataUrl: null})} className="text-sm text-red-500 mt-2 hover:underline">Remove Media</button>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button type="button" onClick={() => handleMediaAction('takePhoto')} className="media-btn"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg> Take Photo</button>
                                                    <button type="button" onClick={() => handleMediaAction('uploadPhoto')} className="media-btn"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg> Upload Photo</button>
                                                    <button type="button" onClick={() => handleMediaAction('recordVideo')} className="media-btn"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg> Record Video</button>
                                                    <button type="button" onClick={() => isRecording ? stopRecording() : handleMediaAction('recordAudio')} className={`media-btn ${isRecording ? 'bg-red-200 text-red-700' : ''}`}><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg> {isRecording ? 'Stop' : 'Record Voice'}</button>
                                                </div>
                                                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                                            </div>
                                        )}
                                    </div>
                                </form>
                             </div>

                             <div className="pt-4 flex-shrink-0">
                                  <button form="issue-form" type="submit" disabled={isSubmitting} className="w-full bg-green-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-600 disabled:bg-gray-400">
                                      {isSubmitting ? 'Submitting...' : 'Send Report'}
                                  </button>
                             </div>
                          </>
                    )}
              </div>
               <style>{`
                    @keyframes fade-in-scale { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                    .animate-fade-in-scale { animation: fade-in-scale 0.2s ease-out forwards; }
                    .media-btn { @apply w-full flex items-center justify-center gap-2 p-3 bg-gray-100 rounded-lg hover:bg-gray-200; }
                `}</style>
        </div>
    );
};


const IssueFeed = ({ issues, onUpvote, currentUserId, onDelete, onViewMedia }) => (
    <div>
        <h2 className="text-2xl font-bold mb-4">Community Issue Feed</h2>
        {issues.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-dashed border-gray-300">
                <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <h3 className="mt-2 text-lg font-medium text-gray-800">No issues yet!</h3>
                <p className="mt-1 text-sm text-gray-500">Be the first to report an issue in your community.</p>
            </div>
        ) : (
            <div className="grid gap-4 md:gap-6 grid-cols-1 lg:grid-cols-2">
                {issues.map(issue => <IssueCard key={issue.id} issue={issue} onUpvote={onUpvote} isOwner={issue.reporterId === currentUserId} onDelete={onDelete} onViewMedia={onViewMedia}/> )}
            </div>
        )}
    </div>
);

const IssueCard = ({ issue, onUpvote, isOwner, onDelete, onViewMedia }) => {
    // ... getStatusInfo function
    const getStatusInfo = (status) => {
        switch (status) {
            case 'Acknowledged': return { class: 'bg-blue-100 text-blue-800', icon: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>};
            case 'In-Progress': return { class: 'bg-yellow-100 text-yellow-800', icon: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>};
            case 'Resolved': return { class: 'bg-green-100 text-green-800', icon: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>};
            default: return { class: 'bg-gray-100 text-gray-800', icon: ''};
        }
    };
    const statusInfo = getStatusInfo(issue.status);
    const mainMediaUrl = issue.imageUrl || issue.photoUrl || issue.videoUrl;
    const mainMediaType = issue.videoUrl ? 'video' : 'photo';

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden transition-all duration-300 hover:shadow-lg hover:scale-[1.02]">
            {mainMediaUrl && (
                <button onClick={() => onViewMedia({ type: mainMediaType, url: mainMediaUrl })} className="w-full relative group">
                    {mainMediaType === 'video' ? (
                        <video src={mainMediaUrl} className="h-48 w-full object-cover" />
                    ) : (
                        <img className="h-48 w-full object-cover" src={mainMediaUrl} alt="Issue illustration" />
                    )}
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-100 transform scale-75 group-hover:scale-100 transition-all"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    </div>
                </button>
            )}
            <div className="p-5">
                <div className="flex justify-between items-start mb-2">
                     <span className={`flex items-center gap-2 text-xs font-bold px-2.5 py-1 rounded-full ${statusInfo.class}`}>{statusInfo.icon} {issue.status}</span>
                    {isOwner && (
                        <button onClick={() => onDelete(issue.id)} className="text-gray-400 hover:text-red-500 p-1 rounded-full hover:bg-red-50 transition-colors">
                             <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    )}
                </div>
                <h3 className="block text-lg leading-tight font-bold text-black">{issue.title}</h3>
                <p className="mt-2 text-sm text-gray-600">{issue.description}</p>
                 <div className="mt-4 flex items-center gap-2">
                    {issue.videoUrl && <button onClick={() => onViewMedia({type: 'video', url: issue.videoUrl})} className="media-icon-btn bg-red-100 text-red-600"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg></button>}
                    {issue.audioUrl && <button onClick={() => onViewMedia({type: 'audio', url: issue.audioUrl})} className="media-icon-btn bg-purple-100 text-purple-600"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg></button>}
                </div>

                <div className="mt-4 flex items-center text-xs text-gray-500">
                    <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    <span>{issue.location}</span>
                </div>
                 {issue.status === 'Resolved' && (
                       <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                           <h4 className="font-semibold text-green-800 text-sm">Proof of Work</h4>
                           <img className="mt-2 h-32 w-full object-cover rounded-md" src="https://placehold.co/600x400/a2e6b9/31343C?text=Work+Completed!" alt="Proof of work" />
                       </div>
                )}
                <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
                    <div className="text-xs text-gray-400">
                         Reported on {new Date(issue.createdAt?.seconds * 1000).toLocaleDateString()}
                    </div>
                     <button onClick={() => onUpvote(issue.id)} className="flex items-center gap-2 text-gray-600 hover:text-blue-600 font-bold transition-colors group p-2 rounded-lg hover:bg-blue-50">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 group-hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" /></svg>
                         <span>{issue.upvotes || 0} Upvotes</span>
                    </button>
                </div>
            </div>
            <style>{`.media-icon-btn { @apply p-2 rounded-full transition-colors; }`}</style>
        </div>
    );
};


const MediaViewerModal = ({ media, onClose }) => (
    <div 
        className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[100] p-4 animate-fade-in"
        onClick={onClose}
    >
        <button 
            className="absolute top-4 right-4 text-white text-3xl z-[110]"
        >
             &times;
        </button>
        <div onClick={(e) => e.stopPropagation()} className="max-w-[90vw] max-h-[90vh] flex items-center justify-center">
            {media.type === 'photo' && <img src={media.url} alt="Full screen issue" className="max-h-full max-w-full object-contain rounded-lg" />}
            {media.type === 'video' && <video src={media.url} controls autoPlay className="max-h-full max-w-full object-contain rounded-lg" />}
            {media.type === 'audio' && <audio src={media.url} controls autoPlay />}
        </div>
        <style>{`
            @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
            .animate-fade-in { animation: fade-in 0.2s ease-out forwards; }
        `}</style>
    </div>
);