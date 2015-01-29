prepHTML: function(message_data){
		var btn_show = $('<span>')
			.addClass('btn_show')
			.html('...');
		var html = message_data.html || message_data.text.replace(/(?:\r\n|\r|\n)/g, '<br/>');
		var stage = $('<div>')
			.hide()
			.html(html)
			.find('blockquote')
				.each(function(){
					if($(this).attr('type')==='cite'){
						$(this).parent()
							.append(btn_show)
							.end()
						.remove();
					}
				})
				.end()
			.find('#signature,#message-coda,#Signature,#OLK_SRC_BODY_SECTION')
				.parent()
					.append(btn_show)
					.end()
				.remove()
				.end();

		stage
			.find('.WordSection1')
				.find('div')
					.nextAll()
						.remove()
						.end()
					.empty()
					.append(btn_show);
		// Quoted messages are sometimes indicated with a tag of the sender's name, e.g. <chris.kirk@slate.com>
		stage.find('*').each(function(){
			if($(this).prop('tagName').indexOf('@')>-1){
				$(this).html(btn_show);
			}
		});

		// Often quoted messages are separated from the new message by horizontal rules
		// stage
		// 	.find('hr')
		// 		.nextAll()
		// 			.remove()
		// 			.end()
		// 		.parent()
		// 			.append(btn_show)
		// 			.end()
		// 		.remove()
		// 		.end();

		stage
			.find('img')
				.each(function(){
					// parse inline images
					if(!message_data.attachments){
						return;
					}
					var src = $(this).attr('src');
					if(src.indexOf('cid:')!==0){
						return;
					}
					var content_id = src.replace('cid:','');
					var attachments = message_data.attachments;
					for(var i=0; i<attachments.length; i++){
						var attachment = attachments[i];
						if(attachment.contentId === content_id){
							var file_name = attachment.fileName;
							var file_path = ['attachments', message_data.mailbox, message_data.uid,file_name].join('/');
							$(this).attr('src',file_path);
							break;
						}
					}
				});
		return stage.html();
	}