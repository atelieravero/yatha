"use client";

import { useState, useTransition } from "react";
import { inviteUser, updateUserRole, toggleUserAccess } from "@/app/actions";

type User = {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  role: string;
  isActive: boolean;
  createdAt: Date;
};

export default function AdminClient({ 
  initialUsers,
  currentUserEmail
}: { 
  initialUsers: User[];
  currentUserEmail: string;
}) {
  const [isPending, startTransition] = useTransition();

  // Invite State
  const [newEmail, setNewEmail] = useState("");
  // Default to ARCHIVIST since Viewer is deferred
  const [newRole, setNewRole] = useState("ARCHIVIST");
  const [inviteError, setInviteError] = useState<string | null>(null);

  const handleInvite = () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      setInviteError("Please enter a valid email address.");
      return;
    }
    
    if (initialUsers.some(u => u.email.toLowerCase() === newEmail.trim().toLowerCase())) {
      setInviteError("This user is already in the system.");
      return;
    }

    startTransition(async () => {
      await inviteUser(newEmail.trim().toLowerCase(), newRole);
      setNewEmail("");
      setNewRole("ARCHIVIST"); 
      setInviteError(null);
    });
  };

  const handleRoleChange = (id: string, role: string) => {
    startTransition(async () => {
      await updateUserRole(id, role);
    });
  };

  const handleToggleAccess = (id: string, currentlyActive: boolean) => {
    const actionStr = currentlyActive ? "revoke access for" : "restore access for";
    if (window.confirm(`Are you sure you want to ${actionStr} this user?`)) {
      startTransition(async () => {
        await toggleUserAccess(id, !currentlyActive);
      });
    }
  };

  return (
    <div className="space-y-8">
      
      {/* 1. INVITE MODULE */}
      <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/50 rounded-xl p-6 shadow-sm transition-colors">
        <h2 className="text-sm font-bold text-blue-800 dark:text-blue-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <span>✨</span> Invite New User
        </h2>
        
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
          <input
            type="email"
            placeholder="colleague@example.com"
            value={newEmail}
            onChange={e => { setNewEmail(e.target.value); setInviteError(null); }}
            disabled={isPending}
            className="flex-1 p-2 text-sm border border-blue-200 dark:border-blue-800/50 rounded-md bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm w-full transition-colors"
          />
          <select
            value={newRole}
            onChange={e => setNewRole(e.target.value)}
            disabled={isPending}
            className="p-2 text-sm border border-blue-200 dark:border-blue-800/50 rounded-md bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm font-medium w-full md:w-auto transition-colors"
          >
            <option value="ARCHIVIST">Archivist (Read/Write)</option>
            <option value="SUPERUSER">Superuser (Admin)</option>
          </select>
          <button
            onClick={handleInvite}
            disabled={isPending || !newEmail.trim()}
            className="px-6 py-2 bg-blue-600 dark:bg-blue-500 text-white text-sm font-bold rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 transition-colors shadow-sm w-full md:w-auto cursor-pointer"
          >
            {isPending ? "Inviting..." : "Add to Roster"}
          </button>
        </div>
        {inviteError && <p className="text-xs text-red-500 dark:text-red-400 font-medium mt-2">{inviteError}</p>}
        <p className="text-[10px] text-gray-500 dark:text-zinc-400 mt-3 leading-relaxed">
          Users will not be notified by email. They simply use "Sign in with Google" and the system will grant them their assigned role upon successful SSO.
        </p>
      </div>

      {/* 2. THE ROSTER */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-zinc-900/50 border-b border-gray-200 dark:border-zinc-800 text-xs uppercase tracking-widest text-gray-500 dark:text-zinc-400 transition-colors">
              <tr>
                <th className="p-4 font-bold">User</th>
                <th className="p-4 font-bold">Role</th>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/50">
              {initialUsers.map(user => {
                const isMe = user.email === currentUserEmail;
                const isPendingLogin = !user.name;

                return (
                  <tr key={user.id} className={`transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800/50 ${!user.isActive ? 'bg-gray-50/50 dark:bg-zinc-800/30 opacity-60' : ''}`}>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {user.avatar ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={user.avatar} alt="Avatar" className={`w-8 h-8 rounded-full shadow-sm object-cover ${!user.isActive ? 'grayscale' : ''}`} />
                        ) : (
                          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 rounded-full flex items-center justify-center text-xs font-bold shadow-sm">
                            {user.email[0].toUpperCase()}
                          </div>
                        )}
                        <div className="flex flex-col">
                          <div className="font-bold text-gray-900 dark:text-zinc-100 flex items-center gap-2">
                            {isPendingLogin ? <span className="italic text-gray-500 dark:text-zinc-500">Pending Login</span> : user.name}
                            {isMe && <span className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400 text-[9px] uppercase tracking-widest rounded-sm border border-emerald-200 dark:border-emerald-800/30">You</span>}
                          </div>
                          <span className="text-xs text-gray-500 dark:text-zinc-400 font-mono">{user.email}</span>
                        </div>
                      </div>
                    </td>
                    
                    <td className="p-4">
                      <select
                        value={user.role}
                        onChange={e => handleRoleChange(user.id, e.target.value)}
                        disabled={isPending || isMe || !user.isActive}
                        className={`p-1.5 text-xs font-bold uppercase tracking-widest border rounded focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${
                          user.role === 'SUPERUSER' 
                            ? 'border-purple-200 dark:border-purple-800/50 text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20' 
                            : 'border-blue-200 dark:border-blue-800/50 text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        }`}
                      >
                        <option value="ARCHIVIST">Archivist</option>
                        <option value="SUPERUSER">Superuser</option>
                      </select>
                    </td>

                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border transition-colors ${
                        user.isActive 
                          ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50' 
                          : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/50'
                      }`}>
                        {user.isActive ? '✅ Active' : '🚫 Revoked'}
                      </span>
                    </td>

                    <td className="p-4 text-right">
                      {!isMe && (
                        <button
                          onClick={() => handleToggleAccess(user.id, user.isActive)}
                          disabled={isPending}
                          className={`text-xs font-bold px-3 py-1.5 rounded transition-colors cursor-pointer ${
                            user.isActive 
                              ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20' 
                              : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                          }`}
                        >
                          {user.isActive ? 'Revoke Access' : 'Restore Access'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}