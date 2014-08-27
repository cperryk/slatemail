var MailParser = require("mailparser").MailParser;
var imapHandler = new require("./modules/imapHandler.js");
var fs = require('fs');

var dbHandler = {
  deleteDB:function(db_name, callback){
    var req = indexedDB.deleteDatabase(db_name);
    req.onsuccess = function () {
      console.log("Deleted database successfully");
      if(callback){
        callback();
      }
    };
    req.onerror = function () {
      console.log("Couldn't delete database");
      if(callback){
        callback();
      }
    };
    req.onblocked = function () {
      console.log("Couldn't delete database due to the operation being blocked");
      if(callback){
        callback();
      }
    };
  },
  createDB:function(callback){
    console.log('creating database');
    var request = indexedDB.open("slatemail");
    request.onupgradeneeded = function(){
      var db = request.result;
      var store = db.createObjectStore("threads", {keyPath:"thread_id", autoIncrement: true});
      console.log('database created with threads store');
    };
    request.onsuccess = function(){
      if(callback){
        callback();
      }
    };
  },
  createLocalBox:function(mailbox_name, callback){
    console.log('creating local mailbox: '+mailbox_name);
    var request = indexedDB.open('slatemail');
    request.onsuccess = function (e){
      var database = e.target.result;
      var version =  parseInt(database.version);
      database.close();
      var secondRequest = indexedDB.open('slatemail', version+1);
      secondRequest.onupgradeneeded = function (e) {
        var database = e.target.result;
        var objectStore = database.createObjectStore('box_'+mailbox_name, {
            keyPath: 'uid'
        });
        objectStore.createIndex("message_id", "messageId", { unique: false });
        objectStore.createIndex("subject", "subject", { unique: false });
      };
      secondRequest.onsuccess = function (e) {
        e.target.result.close();
        console.log('local mailbox '+mailbox_name+'created');
        if(callback){
          callback();
        }
      };
    };
  },
  saveMailToLocalBox:function(mailbox_name, mail_obj, callback){
    console.log('*** saving mail object to local box: '+mailbox_name+':'+mail_obj.uid);
    console.log(mail_obj);
    dbHandler.saveAttachments(mailbox_name, mail_obj, function(){
      var request = indexedDB.open("slatemail");
      request.onsuccess = function(){
        var db = request.result;
        var tx = db.transaction("box_"+mailbox_name,"readwrite");
        var store = tx.objectStore("box_"+mailbox_name);
        store.put(mail_obj);
        console.log('database insertion successful');
        dbHandler.threadMail(mailbox_name, mail_obj, callback);
      };
    });
  },
  threadMail:function(mailbox_name, mail_obj, callback){
    var mail_uid = mail_obj.uid;
    console.log('threading message '+mailbox_name+':'+mail_uid);
    traceInReplyTo(function(thread_id){
      if(!thread_id){
        traceReferences(function(thread_id){
          if(!thread_id){
            saveMailObjectToNewThread(mail_obj, function(thread_id){
              updateMailWithThreadID(mailbox_name, mail_uid, thread_id, callback);
            });
          }
          else{
            saveToExistingThread(thread_id, callback);
          }
        });
      }
      else{
        saveToExistingThread(thread_id, callback);
      }
    });
    function saveToExistingThread(thread_id, callback){
      var open_request = indexedDB.open("slatemail");
      open_request.onsuccess = function(){
        var db = open_request.result;
        var tx = db.transaction("threads","readwrite");
        var store = tx.objectStore("threads");
        var get_request = store.get(thread_id);
        get_request.onsuccess = function(){
          console.log('existing thread found');
          var data = get_request.result;
          data.thread_id = thread_id;
          data.messages.push(mailbox_name+':'+mail_uid);
          var request_update = store.put(data);
          request_update.onsuccess = function(){
            console.log('saved message '+mailbox_name+':'+mail_uid+' to existing thread '+thread_id);
            updateMailWithThreadID(mailbox_name, mail_uid, thread_id, callback);
          };
        };
      };
    }
    function saveMailObjectToNewThread(mail_obj, callback){
      var open_request = indexedDB.open("slatemail");
      open_request.onsuccess = function(){
        var db = open_request.result;
        var tx = db.transaction("threads","readwrite");
        var store = tx.objectStore("threads");
        var data = {
          messages:[mailbox_name+':'+mail_uid]
        };
        var add_request = store.add(data);
        add_request.onsuccess = function(){
          var thread_id = event.target.result;
          console.log('saved message '+mailbox_name+mail_uid+' to new thread '+thread_id);
          mail_obj.thread_id = event.target.result;
          if(callback){
            callback(mail_obj.thread_id);
          }
        };
      };
    }
    function traceInReplyTo(callback){
      if(!mail_obj.inReplyTo || mail_obj.inReplyTo.length === 0){
        callback(false);
      }
      else{
        traceMessage(mail_obj.inReplyTo, 0, callback);
      }
    }
    function traceReferences(callback){
      if(!mail_obj.references || mail_obj.references.length === 0){
        callback(false);
      }
      else{
        traceMessage(mail_obj.references, 0, callback);
      }
    }
    function traceMessage(message_ids, current_index, callback){
      var message_id = message_ids[current_index];
      dbHandler.findMailWithMessageID(message_id, function(mail_object){
        if(mail_object === false){
          if(current_index < message_ids.length - 1){
            traceMessage(message_ids, current_index+1, callback);
          }
          else{
            callback(false);
          }
        }
        else if(!mail_object.thread_id){
          traceMessage(message_ids, current_index+1, callback);
        }
        else{
          callback(mail_object.thread_id);
        }
      });
    }
    function updateMailWithThreadID(box_name, uid, thread_id, callback){
      var open_request = indexedDB.open("slatemail");
      open_request.onsuccess = function(){
        var db = open_request.result;
        var tx = db.transaction("box_"+box_name,"readwrite");
        var store = tx.objectStore("box_"+box_name);
        var get_request = store.get(uid);
        get_request.onsuccess = function(){
          var data = get_request.result;
          data.thread_id = thread_id;
          var update_request = store.put(data);
          update_request.onsuccess = function(){
            if(callback){
              callback();
            }
          };
        };
      };
    }
  },
  findMailWithMessageID:function(message_id, callback){
    dbHandler.getMailFromBoxWithMessageId('INBOX', message_id, callback);
  },
  getMailFromBoxWithMessageId:function(mailbox_name, message_id, callback){
    var request_db = indexedDB.open('slatemail');
    request_db.onsuccess = function(){
      var db = request_db.result;
      var tx = db.transaction('box_'+mailbox_name,"readonly");
      var store = tx.objectStore('box_'+mailbox_name);
      var index = store.index('message_id');
      var get_request = index.get(message_id);
      get_request.onsuccess = function(){
        var matching = get_request.result;
        if(matching!==undefined){
          callback(get_request.result);
        }
        else{
          callback(false);
        }
      };
    };
  },
  getMailFromLocalBox:function(mailbox_name, uid, callback){
    //console.log('getMailFromLocalBox',mailbox_name, uid);
    var request_db = indexedDB.open("slatemail");
    request_db.onsuccess = function(){
      var db = request_db.result;
      var tx = db.transaction("box_"+mailbox_name,"readonly");
      var store = tx.objectStore("box_"+mailbox_name);
      var request = store.get(uid);
      request.onsuccess = function(){
        var matching = request.result;
        if(matching!==undefined){
          callback(request.result);
        }
        else{
          callback(false);
        }
      };
    };
  },
  test:function(){
    dbHandler.deleteDB('slatemail',function(){
      dbHandler.createDB(function(){
        dbHandler.createLocalBox('INBOX',function(){
          // getEmail('test_email', function(mail_obj){
          //   mail_obj.uid = 1;
          //   saveMailToLocalBox('INBOX', mail_obj);
          // });
          dbHandler.syncBox('INBOX');
        });
      });
    });
  },
  updateFlags:function(box_name, uid, flags, callback){
    var open_request = indexedDB.open('slatemail');
    open_request.onsuccess = function(){
      var db = open_request.result;
      var tx = db.transaction("box_"+box_name,"readwrite");
      var store = tx.objectStore("box_"+box_name);
      var get_request = store.get(uid);
      get_request.onsuccess = function(){
        var data = get_request.result;
        data.flags = flags;
        var update_request = store.put(data);
        update_request.onsuccess = function(){
          if(callback){
            callback();
          }
        };
      };
    };
  },
  syncBox:function(mailbox_name, callback){
    console.log('syncing: '+mailbox_name);
    imapHandler.getUIDsFlags(function(msgs){
      addLocalMessages(msgs);
      deleteLocalMessages(msgs);
    });
    function addLocalMessages(msgs){
      var messages_to_process = msgs.length;
      msgs.forEach(function(msg, index){
        dbHandler.getMailFromLocalBox(mailbox_name, msg.uid, function(result){
          if(!result){ // no message found in local
            imapHandler.getMessageWithUID(msg.uid, function(mail_obj){
              mail_obj.uid = msg.uid;
              mail_obj.flags = msg.flags;
              dbHandler.saveMailToLocalBox('INBOX', mail_obj, function(){
                checkEnd(index);
              });
            });
          }
          else{ // msg found in local
            dbHandler.updateFlags(mailbox_name, msg.uid, msg.flags, function(){
              checkEnd(index);
            });
          }
        });
      });
      function checkEnd(index){
        if(index === messages_to_process-1){
          console.log('sync complete');
          if(callback){
            callback();
          }
        }
      }
    }
    function deleteLocalMessages(msgs){
      var uids = (function(){
        var out = [];
        msgs.forEach(function(msg){
          out.push(msg.uid);
        });
        return out;
      }());
      dbHandler.getMessagesFromMailbox('INBOX', function(mail_object){
        if(uids.indexOf(mail_object.uid)===-1){
          dbHandler.deleteMessage('INBOX', mail_object.uid);
        }
      });
    }
  },
  deleteMessage:function(box_name, uid, callback){
    console.log('deleting local '+box_name+':'+uid);
    var request = indexedDB.open('slatemail');
    request.onsuccess = function(){
      var db = request.result;
      var objectStore = db.transaction("box_"+box_name,'readwrite').objectStore("box_"+box_name);
      var delete_request = objectStore.delete(uid);
      delete_request.onsuccess = function(){
        console.log(box_name+':'+uid+' deleted');
        if(callback){
          callback();
        }
      };
    };
  },
  getMessagesFromMailbox:function(box_name, onMessage, onEnd){
    console.log('get messages');
    var request = indexedDB.open('slatemail');
    request.onsuccess = function (e){
      var db = request.result;
      var objectStore = db.transaction("box_"+box_name).objectStore("box_"+box_name);
      objectStore.openCursor(null, 'prev').onsuccess = function(event) {
        var cursor = event.target.result;
        if (cursor) {
          var mail_object = cursor.value;
          if(onMessage){
            onMessage(mail_object);
          }
          cursor.continue();
        }
        else {
          console.log('no more entries');
          if(onEnd){
            onEnd();
          }
        }
      };
    };
  },
  getThread:function(thread_id, callback){
    var request = indexedDB.open('slatemail');
    request.onsuccess = function(){
      var db = request.result;
      var objectStore = db.transaction('threads','readonly').objectStore('threads');
      var get_request = objectStore.get(thread_id);
      get_request.onsuccess = function(){
        var matching = get_request.result;
        callback(matching);
      };
    };
  },
  getThreadMessages:function(thread_id, callback){
    dbHandler.getThread(thread_id, function(thread_data){
      console.log(thread_data);
      var message_umis = thread_data.messages;
      var messages_to_get = message_umis.length;
      var mail_objs = [];
      message_umis.forEach(function(umi, index){
        umi = umi.split(':');
        var mailbox_name = umi[0];
        var uid = parseInt(umi[1],10);
        dbHandler.getMailFromLocalBox(mailbox_name, uid, function(mail_obj){
          mail_objs.push(mail_obj);
          if(mail_objs.length === messages_to_get){
            mail_objs.sort(sortbyuid);
            callback(mail_objs);
          }
        });
      });
    });
    function sortbyuid(a,b){
      if(a.uid > b.uid){
        return -1;
      }
      else{
        return 1;
      }
    }
  },
  saveAttachments:function(box_name, mail_object, callback){
    if(!mail_object.attachments){
      callback(mail_object);
      return;
    }
    createFolders(function(){
      var path = 'attachments/'+box_name+'/'+mail_object.uid+'/';
      var attachments = mail_object.attachments;
      var attachments_to_save = attachments.length;
      var saved_attachments = 0;
      attachments.forEach(function(attachment, index){
        fs.writeFile(path+attachment.fileName, attachment.content, function(){
          delete mail_object.attachments[index].content;
          saved_attachments ++;
          if(saved_attachments === attachments_to_save){
            if(callback){
              callback(mail_object);
            }
          }
        });
      });
    });
    function createFolders(callback){
      createDirectoryIfNotExists('attachments', function(){
        createDirectoryIfNotExists('attachments/'+box_name, function(){
          createDirectoryIfNotExists('attachments/'+box_name+'/'+mail_object.uid,callback);
        });
      });
    }
    function createDirectoryIfNotExists(path, callback){
      fs.exists(path,function(exists){
        if(!exists){
          console.log('creating directory: '+path);
          fs.mkdir(path, callback);
        }
        else{
          callback();
        }
      });
    }
  }
};


// var Inbox = new inbox_library.Inbox(CREDENTIALS, dbHandler.test);
