-- Compatibilité entre les scripts de cartes (CardScripts, à jour) et le moteur embarqué (plus ancien).
-- Chargé juste après utility.lua, pour chaque duel.

-- Les scripts récents demandent au moteur des informations de chaîne qu'il ne connaît pas encore
-- (« Passed invalid CHAININFO flag »). L'erreur interrompait Duel.RegisterEffect : tous les effets
-- différés enregistrés pendant une résolution (« détruisez-le pendant la End Phase », « jusqu'à la fin
-- du tour »...) étaient perdus. On répond nil pour une information inconnue au lieu d'échouer.
do
	local get_chain_info=Duel.GetChainInfo
	function Duel.GetChainInfo(ch,...)
		local flags=table.pack(...)
		local all=table.pack(pcall(get_chain_info,ch,...))
		if all[1] then return table.unpack(all,2,all.n) end
		local out={}
		for i=1,flags.n do
			local ok,value=pcall(get_chain_info,ch,flags[i])
			if ok then out[i]=value end
		end
		return table.unpack(out,1,flags.n)
	end
end

-- Matériels de Fusion, un emplacement à la fois.
-- Pour « 1 monstre "Yubel" + 1 Démon », le moteur propose d'un coup toutes les cartes qui conviennent à
-- l'un ou l'autre emplacement. On resserre la liste : d'abord les cartes de l'emplacement le plus précis
-- (celui qui accepte le moins de cartes : « Yubel »), puis, une fois choisies, celles du suivant (le Démon).
-- Le moteur a déjà écarté les cartes qui ne permettent pas de finir l'invocation : on ne fait que trier,
-- jamais ajouter. Sans emplacement identifiable, la liste reste celle du moteur.
do
	local stage=nil
	local select_unselect=Group.SelectUnselect

	local function matches(st,i,c,sg)
		local ok,res=pcall(st.funs[i],c,st.fc,st.sub,st.sub,nil,sg,st.tp,st.contact,st.sumtype)
		return ok and res and true or false
	end

	local function narrow(cg,sg)
		local st=stage
		if not st or not cg or not sg then return cg end
		-- Emplacements déjà remplis : chaque carte choisie prend, parmi ceux qu'elle remplit, le plus précis.
		local taken={}
		for c in aux.Next(sg) do
			local best
			for i=1,#st.funs do
				if not taken[i] and matches(st,i,c,sg) and (not best or st.count[i]<st.count[best]) then best=i end
			end
			if best then taken[best]=true end
		end
		local pick,pickg
		for i=1,#st.funs do
			if not taken[i] then
				local g=cg:Filter(function(c) return matches(st,i,c,sg) end,nil)
				if #g>0 and (not pick or st.count[i]<st.count[pick]) then pick,pickg=i,g end
			end
		end
		-- Les cartes déjà choisies restent décochables : le moteur les reçoit par le second groupe.
		if pickg and #pickg<#cg then return pickg end
		return cg
	end

	function Group.SelectUnselect(cg,sg,...)
		if stage then
			local ok,res=pcall(narrow,cg,sg)
			if ok and res then cg=res end
		end
		return select_unselect(cg,sg,...)
	end

	-- Prépare l'état d'une sélection : emplacements, et nombre de cartes que chacun accepte.
	local function wrap(make,fixed_args)
		return function(...)
			local args=table.pack(...)
			local op=make(table.unpack(args,1,args.n))
			local funs={table.unpack(args,fixed_args+1,args.n)}
			return function(e,tp,eg,ep,ev,re,r,rp,gc,chkfnf,summonEff)
				local fc=e:GetHandler()
				local contact=((chkfnf or 0)&FUSPROC_CONTACTFUS)~=0
				local notfusion=((chkfnf or 0)&FUSPROC_NOTFUSION)~=0
				local listedmats=((chkfnf or 0)&FUSPROC_LISTEDMATS)~=0
				local sumtype=SUMMON_TYPE_FUSION|MATERIAL_FUSION
				if listedmats then sumtype=0 elseif contact or notfusion then sumtype=MATERIAL_FUSION end
				local sub=not listedmats and (args[2] or notfusion) and not contact
				local st={funs=funs,fc=fc,tp=fc:GetControler(),sub=sub,contact=contact,sumtype=sumtype,count={}}
				if #funs>=2 and eg then
					for i=1,#funs do
						local n=0
						for c in aux.Next(eg) do if matches(st,i,c,Group.CreateGroup()) then n=n+1 end end
						st.count[i]=n
					end
					stage=st
				end
				local res=table.pack(pcall(op,e,tp,eg,ep,ev,re,r,rp,gc,chkfnf,summonEff))
				stage=nil
				if not res[1] then error(res[2],0) end
				return table.unpack(res,2,res.n)
			end
		end
	end
	-- insf, sub, puis les emplacements ; pour MixRep : insf, sub, fun1, minc, maxc, puis les emplacements fixes.
	Fusion.OperationMix=wrap(Fusion.OperationMix,2)
	Fusion.OperationMixRep=wrap(Fusion.OperationMixRep,5)
end
