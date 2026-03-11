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
      <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-bold text-blue-800 uppercase tracking-widest mb-4 flex items-center gap-2">
          <span>✨</span> Invite New User
        </h2>
        
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
          <input
            type="email"
            placeholder="colleague@example.com"
            value={newEmail}
            onChange={e => { setNewEmail(e.target.value); setInviteError(null); }}
            disabled={isPending}
            className="flex-1 p-2 text-sm border border-blue-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm w-full"
          />
          <select
            value={newRole}
            onChange={e => setNewRole(e.target.value)}
            disabled={isPending}
            className="p-2 text-sm border border-blue-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm font-medium w-full md:w-auto"
          >
            <option value="ARCHIVIST">Archivist (Read/Write)</option>
            <option value="SUPERUSER">Superuser (Admin)</option>
          </select>
          <button
            onClick={handleInvite}
            disabled={isPending || !newEmail.trim()}
            className="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm w-full md:w-auto cursor-pointer"
          >
            {isPending ? "Inviting..." : "Add to Roster"}
          </button>
        </div>
        {inviteError && <p className="text-xs text-red-500 font-medium mt-2">{inviteError}</p>}
        <p className="text-[10px] text-gray-500 mt-3">
          Users will not be notified by email. They simply use "Sign in with Google" and the system will grant them their assigned role upon successful SSO.
        </p>
      </div>

      {/* 2. THE ROSTER */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-widest text-gray-500">
              <tr>
                <th className="p-4 font-bold">User</th>
                <th className="p-4 font-bold">Role</th>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {initialUsers.map(user => {
                const isMe = user.email === currentUserEmail;
                const isPendingLogin = !user.name;

                return (
                  <tr key={user.id} className={`transition-colors hover:bg-gray-50 ${!user.isActive ? 'bg-gray-50/50 opacity-60' : ''}`}>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {user.avatar ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={user.avatar} alt="Avatar" className={`w-8 h-8 rounded-full shadow-sm object-cover ${!user.isActive ? 'grayscale' : ''}`} />
                        ) : (
                          <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold shadow-sm">
                            {user.email[0].toUpperCase()}
                          </div>
                        )}
                        <div className="flex flex-col">
                          <div className="font-bold text-gray-900 flex items-center gap-2">
                            {isPendingLogin ? <span className="italic text-gray-500">Pending Login</span> : user.name}
                            {isMe && <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] uppercase tracking-widest rounded-sm">You</span>}
                          </div>
                          <span className="text-xs text-gray-500 font-mono">{user.email}</span>
                        </div>
                      </div>
                    </td>
                    
                    <td className="p-4">
                      <select
                        value={user.role}
                        onChange={e => handleRoleChange(user.id, e.target.value)}
                        disabled={isPending || isMe || !user.isActive}
                        className={`p-1.5 text-xs font-bold uppercase tracking-widest border rounded focus:ring-2 focus:ring-blue-500 outline-none ${user.role === 'SUPERUSER' ? 'border-purple-200 text-purple-700 bg-purple-50' : 'border-blue-200 text-blue-700 bg-blue-50'}`}
                      >
                        <option value="ARCHIVIST">Archivist</option>
                        <option value="SUPERUSER">Superuser</option>
                      </select>
                    </td>

                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border ${user.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                        {user.isActive ? '✅ Active' : '🚫 Revoked'}
                      </span>
                    </td>

                    <td className="p-4 text-right">
                      {!isMe && (
                        <button
                          onClick={() => handleToggleAccess(user.id, user.isActive)}
                          disabled={isPending}
                          className={`text-xs font-bold px-3 py-1.5 rounded transition-colors cursor-pointer ${user.isActive ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
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